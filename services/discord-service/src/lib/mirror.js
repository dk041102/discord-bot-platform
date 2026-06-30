import fetch from 'node-fetch';

/**
 * Sends a mirrored notification to whichever second channel the guild configured.
 * Supports two webhook shapes because Slack and Discord webhooks expect
 * different JSON bodies:
 *   - Slack Incoming Webhook:   { text: "..." }
 *   - Discord channel webhook:  { content: "..." }
 *
 * Returns nothing on success; throws on any non-2xx or network failure so the
 * caller (outbox worker) can record the failure and retry later instead of
 * silently dropping the notification.
 */
export async function sendMirror({ mirrorType, webhookUrl, text }) {
  if (!webhookUrl || mirrorType === 'none') {
    return { skipped: true };
  }

  const body =
    mirrorType === 'slack_webhook'
      ? { text }
      : { content: text };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Don't let a hanging webhook endpoint block the outbox worker forever.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`mirror webhook returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  return { skipped: false };
}

export function formatMirrorText({ commandName, username, input, responseText, guildName }) {
  const server = guildName ? ` in ${guildName}` : '';
  const inputPart = input ? ` — "${input}"` : '';
  return `📋 /${commandName} run by ${username || 'someone'}${server}${inputPart}\n↳ ${responseText || '(no response text)'}`;
}
