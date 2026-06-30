import express from 'express';
import fetch from 'node-fetch';
import { query } from '../db/pool.js';
import { triageWithAI } from '../lib/aiClient.js';

export const interactionsRouter = express.Router();

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  MODAL: 9,
};

/**
 * POST / — the single Discord Interactions Endpoint URL you register in the
 * Developer Portal. Signature verification has already run (see server.js,
 * which mounts verifyDiscordSignature before this router).
 */
interactionsRouter.post('/', async (req, res) => {
  const interaction = req.body;

  // --- 1. PING handshake -----------------------------------------------
  // Discord sends this once when you save the endpoint URL, and may send it
  // again as a health check. Must reply with PONG or Discord deactivates the
  // endpoint.
  if (interaction.type === InteractionType.PING) {
    return res.json({ type: InteractionResponseType.PONG });
  }

  // --- 2. Dedup ----------------------------------------------------------
  // Discord can deliver the same interaction more than once (retries on slow
  // responses, network blips). We rely on a UNIQUE constraint on
  // interactions.interaction_id rather than a SELECT-then-INSERT check, so
  // this is race-safe even under concurrent duplicate delivery.
  const interactionId = interaction.id;
  const commandName = interaction.data?.name ?? 'unknown';
  const commandInput = extractCommandInput(interaction);

  let isNew = true;
  try {
    await query(
      `INSERT INTO interactions
         (interaction_id, guild_id, channel_id, user_id, username,
          command_name, command_input, interaction_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received')`,
      [
        interactionId,
        interaction.guild_id ?? null,
        interaction.channel_id ?? null,
        interaction.member?.user?.id ?? interaction.user?.id ?? null,
        interaction.member?.user?.username ?? interaction.user?.username ?? null,
        commandName,
        commandInput,
        interaction.type,
      ],
    );
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation on interaction_id — we've already seen this one.
      // Per Discord's own guidance, replaying a duplicate ack is safe; we
      // just don't redo any side effects (DB writes, mirror, AI call).
      isNew = false;
    } else {
      console.error('[interactions] failed to record interaction', err);
      // We still must respond, or Discord will show the command as failed
      // and may retry — which would just hit this same error again. Reply
      // with a generic error message instead of crashing the request.
      return res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '⚠️ Something went wrong recording that command. Please try again.' },
      });
    }
  }

  if (!isNew) {
    // We already responded to this interaction_id on a previous delivery.
    // Discord only needs *a* valid response to clear the retry, but the
    // *type* of that response must match what's valid for this interaction
    // type — DEFERRED_UPDATE_MESSAGE (6) is only a legal response to a
    // MESSAGE_COMPONENT or MODAL_SUBMIT interaction; replying with it to a
    // duplicate APPLICATION_COMMAND delivery would itself be rejected by
    // Discord's API. For a duplicate slash command we instead send the
    // "thinking…" deferred type, which is valid there, and immediately
    // follow up with a quiet ack so it doesn't hang in a loading state.
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
      await sendDuplicateFollowup(interaction);
      return;
    }
    return res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
  }

  // --- 3. Route by interaction type --------------------------------------
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction, res);
  }

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModalSubmit(interaction, res);
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleApplicationCommand(interaction, res, commandName, commandInput);
  }

  // Unknown interaction type — ack politely rather than 500. PING is handled
  // above, MESSAGE_COMPONENT/MODAL_SUBMIT/APPLICATION_COMMAND are the only
  // other types Discord currently sends, so DEFERRED_UPDATE_MESSAGE is a
  // reasonable generic fallback for any future type Discord might add here.
  return res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
});

/**
 * Discord requires a real follow-up after a deferred response — leaving a
 * deferred "thinking…" message unresolved looks broken in the client even
 * though the interaction technically succeeded. For the duplicate-delivery
 * path we already have the real response_text stored from the first
 * delivery, so just edit the original message via the webhook follow-up
 * endpoint to that same content rather than leaving it hanging.
 */
async function sendDuplicateFollowup(interaction) {
  try {
    const result = await query(
      `SELECT response_text FROM interactions WHERE interaction_id = $1`,
      [interaction.id],
    );
    const responseText = result.rows[0]?.response_text || 'Already processed.';
    const appId = process.env.DISCORD_APPLICATION_ID;
    await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: responseText }),
      },
    );
  } catch (err) {
    // Not fatal — the deferred ack already satisfied Discord's requirement;
    // worst case the message is left saying "thinking..." a bit longer.
    console.warn('[interactions] duplicate-delivery followup edit failed', err.message);
  }
}

function extractCommandInput(interaction) {
  const opts = interaction.data?.options;
  if (!opts || opts.length === 0) return null;
  // Flatten simple string/number options into a readable string, e.g.
  // "/report text:server is down" -> "server is down"
  return opts.map((o) => o.value).filter(Boolean).join(' ');
}

async function handleApplicationCommand(interaction, res, commandName, commandInput) {
  const guildId = interaction.guild_id;

  // Look up this command's config for the guild (enabled flag, reply template,
  // whether to mirror, whether to run AI triage). Falls back to sane defaults
  // if the guild/command hasn't been configured yet in the dashboard.
  const config = await getCommandConfig(guildId, commandName);

  if (config && !config.enabled) {
    return res.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `The /${commandName} command is currently disabled.` },
    });
  }

  // /report opens a modal (stretch goal: a second interaction type).
  if (commandName === 'report' && shouldUseModal(interaction)) {
    return res.json({
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: `report_modal_${interaction.id}`,
        title: 'File a report',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'report_text',
                style: 1,
                label: 'What are you reporting?',
                required: true,
                max_length: 500,
              },
            ],
          },
        ],
      },
    });
  }

  const replyTemplate = config?.reply_template ?? 'Got it: {input}';
  const responseText = replyTemplate.replace('{input}', commandInput || '(no input)');

  // Respond immediately within Discord's ~3s window. For /status we attach a
  // button (stretch goal: interactive component) that triggers a follow-up
  // interaction (handled in handleComponent below).
  const responseData = {
    content: responseText,
  };

  if (commandName === 'status') {
    responseData.components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: 'Acknowledge',
            custom_id: `ack_${interaction.id}`,
          },
        ],
      },
    ];
  }

  res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: responseData,
  });

  // Everything below happens *after* we've already answered Discord, so it
  // can take as long as it needs without risking the 3s timeout.
  await finishProcessing({
    interaction,
    commandName,
    commandInput,
    responseText,
    config,
  });
}

async function handleComponent(interaction, res) {
  // The "Acknowledge" button from /status. Respond by updating the original
  // message so the click feels instant, then log it.
  res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: '✅ Acknowledged.', flags: 64 /* EPHEMERAL */ },
  });

  await query(
    `UPDATE interactions SET status = 'responded', updated_at = now() WHERE interaction_id = $1`,
    [interaction.id],
  );
}

async function handleModalSubmit(interaction, res) {
  const textValue = interaction.data?.components?.[0]?.components?.[0]?.value ?? '';
  const responseText = `Report received: ${textValue}`;

  res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: responseText },
  });

  const config = await getCommandConfig(interaction.guild_id, 'report');
  await finishProcessing({
    interaction,
    commandName: 'report',
    commandInput: textValue,
    responseText,
    config,
  });
}

function shouldUseModal(interaction) {
  // Simple heuristic: if /report was called with no text option, open a modal
  // to collect it instead of failing. If text was already supplied inline,
  // skip the modal and respond immediately — better UX, still demonstrates
  // both code paths.
  const opts = interaction.data?.options;
  return !opts || opts.length === 0;
}

async function getCommandConfig(guildId, commandName) {
  if (!guildId) return null;
  const result = await query(
    `SELECT cc.* FROM command_configs cc
       JOIN guilds g ON g.id = cc.guild_id
      WHERE g.guild_id = $1 AND cc.command_name = $2`,
    [guildId, commandName],
  );
  return result.rows[0] ?? null;
}

/**
 * Runs everything that doesn't need to happen inside the 3s window:
 * marking the interaction responded, running optional AI triage, and
 * enqueueing the mirror notification into the outbox (a separate worker
 * delivers it with retries — see outboxWorker.js). Enqueueing into a durable
 * table rather than firing the webhook directly here is what keeps a mirror
 * delivery from being silently lost if Slack/Discord is briefly down.
 */
async function finishProcessing({ interaction, commandName, commandInput, responseText, config }) {
  try {
    let aiSummary = null;
    let aiTags = [];

    if (config?.ai_triage_enabled) {
      const triage = await triageWithAI(commandInput);
      if (triage) {
        aiSummary = triage.summary;
        aiTags = triage.tags;
      }
    }

    await query(
      `UPDATE interactions
          SET status = 'responded', response_text = $1, ai_summary = $2, ai_tags = $3, updated_at = now()
        WHERE interaction_id = $4`,
      [responseText, aiSummary, aiTags, interaction.id],
    );

    const mirrorEnabled = config?.mirror_enabled !== false;
    if (mirrorEnabled) {
      const guildRow = await query(
        `SELECT guild_name, mirror_type, mirror_webhook_url FROM guilds WHERE guild_id = $1`,
        [interaction.guild_id],
      );
      const guild = guildRow.rows[0];

      if (guild?.mirror_webhook_url) {
        await query(
          `INSERT INTO mirror_outbox (interaction_id, payload) VALUES ($1, $2)`,
          [
            interaction.id,
            JSON.stringify({
              mirrorType: guild.mirror_type,
              webhookUrl: guild.mirror_webhook_url,
              commandName,
              username: interaction.member?.user?.username ?? interaction.user?.username,
              input: commandInput,
              responseText,
              guildName: guild.guild_name,
            }),
          ],
        );
      } else {
        await query(
          `UPDATE interactions SET mirror_status = 'skipped' WHERE interaction_id = $1`,
          [interaction.id],
        );
      }
    } else {
      await query(
        `UPDATE interactions SET mirror_status = 'skipped' WHERE interaction_id = $1`,
        [interaction.id],
      );
    }
  } catch (err) {
    console.error('[interactions] post-response processing failed', err);
    await query(
      `UPDATE interactions
          SET status = 'failed',
              error_log = error_log || $1::jsonb,
              updated_at = now()
        WHERE interaction_id = $2`,
      [JSON.stringify([{ at: new Date().toISOString(), stage: 'finishProcessing', message: err.message }]), interaction.id],
    ).catch((e) => console.error('[interactions] even the error-log write failed', e));
  }
}
