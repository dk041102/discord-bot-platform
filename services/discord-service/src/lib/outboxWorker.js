import { query } from '../db/pool.js';
import { sendMirror, formatMirrorText } from './mirror.js';

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 4000;

/**
 * Polls mirror_outbox for pending rows whose next_attempt_at has passed,
 * tries to deliver them, and reschedules with exponential backoff on
 * failure. This is what satisfies the "should not silently lose an
 * interaction if the mirror channel is briefly unavailable" requirement —
 * a webhook outage doesn't drop the notification, it just delays it.
 *
 * Runs in-process via setInterval rather than a separate cron/queue service,
 * which is a deliberate scope tradeoff for a free-tier deployment: Render's
 * free web service tier doesn't offer a separate worker dyno without a card,
 * so the outbox drains on a timer inside the same long-running process that
 * already handles interactions. Documented as a known limitation in
 * AI_NOTES.md / README — a real production version would split this into
 * its own worker process or use a managed queue.
 */
export function startOutboxWorker() {
  const interval = setInterval(drainOutbox, POLL_INTERVAL_MS);
  // Run once immediately on boot too, don't wait for the first tick.
  drainOutbox();
  return () => clearInterval(interval);
}

async function drainOutbox() {
  let rows;
  try {
    const result = await query(
      `SELECT * FROM mirror_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY created_at ASC
        LIMIT 10`,
    );
    rows = result.rows;
  } catch (err) {
    console.error('[outbox] failed to read pending rows', err);
    return;
  }

  for (const row of rows) {
    await deliverOne(row);
  }
}

async function deliverOne(row) {
  const payload = row.payload;
  try {
    const text = formatMirrorText(payload);
    const result = await sendMirror({
      mirrorType: payload.mirrorType,
      webhookUrl: payload.webhookUrl,
      text,
    });

    await query(`UPDATE mirror_outbox SET status = 'sent' WHERE id = $1`, [row.id]);
    await query(
      `UPDATE interactions SET mirror_status = $1, status = 'mirrored', updated_at = now() WHERE interaction_id = $2`,
      [result.skipped ? 'skipped' : 'sent', row.interaction_id],
    );
  } catch (err) {
    const attempts = row.attempts + 1;
    const isDead = attempts >= MAX_ATTEMPTS;
    // Exponential backoff: 10s, 20s, 40s, 80s, then dead-letter.
    const backoffMs = Math.min(10_000 * 2 ** (attempts - 1), 5 * 60_000);

    console.warn(
      `[outbox] delivery failed for interaction ${row.interaction_id} (attempt ${attempts}/${MAX_ATTEMPTS}):`,
      err.message,
    );

    await query(
      `UPDATE mirror_outbox
          SET attempts = $1,
              status = $2,
              last_error = $3,
              next_attempt_at = now() + interval '1 millisecond' * $4
        WHERE id = $5`,
      [attempts, isDead ? 'dead' : 'pending', err.message.slice(0, 500), backoffMs, row.id],
    );

    if (isDead) {
      await query(
        `UPDATE interactions
            SET mirror_status = 'failed',
                error_log = error_log || $1::jsonb,
                updated_at = now()
          WHERE interaction_id = $2`,
        [
          JSON.stringify([{ at: new Date().toISOString(), stage: 'mirror_outbox', message: `gave up after ${attempts} attempts: ${err.message}` }]),
          row.interaction_id,
        ],
      ).catch((e) => console.error('[outbox] failed to record dead-letter on interaction', e));
    }
  }
}
