import 'dotenv/config';
import express from 'express';
import { verifyDiscordSignature } from './middleware/verifySignature.js';
import { interactionsRouter } from './routes/interactions.js';
import { startOutboxWorker } from './lib/outboxWorker.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Capture the raw request body bytes via the `verify` hook, BEFORE the JSON
// parser runs. This is required for Ed25519 verification: Discord signs the
// exact bytes it sent, and re-serializing parsed JSON is not guaranteed to
// produce an identical byte string (key order, number formatting, escaping).
// See middleware/verifySignature.js for the full explanation.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

// Health check — used by the hosting platform and by us to confirm the
// service is up independent of Discord ever calling it.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'discord-service' }));

// The actual Interactions Endpoint URL you paste into the Discord Developer
// Portal is this service's base URL, e.g. https://your-app.onrender.com/
// Signature verification runs for every request to this route — including
// the PING handshake — exactly as Discord requires.
app.use('/', verifyDiscordSignature, interactionsRouter);

app.listen(PORT, () => {
  console.log(`[discord-service] listening on port ${PORT}`);
  // Start draining any pending mirror notifications, including ones left
  // over from before a restart — nothing in the outbox is ever lost to a
  // redeploy.
  startOutboxWorker();
});
