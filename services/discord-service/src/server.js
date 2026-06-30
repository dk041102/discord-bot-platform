import 'dotenv/config';
import express from 'express';
import { verifyDiscordSignature } from './middleware/verifySignature.js';
import { interactionsRouter } from './routes/interactions.js';
import { startOutboxWorker } from './lib/outboxWorker.js';

const app = express();
const PORT = process.env.PORT || 3001;


app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);


app.get('/health', (_req, res) => res.json({ ok: true, service: 'discord-service' }));


app.use('/', verifyDiscordSignature, interactionsRouter);

app.listen(PORT, () => {
  console.log(`[discord-service] listening on port ${PORT}`);
 
  startOutboxWorker();
});
