import 'dotenv/config';
import express from 'express';
import { triageRouter } from './routes/triage.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai-service' }));

app.use('/triage', triageRouter);

app.listen(PORT, () => {
  console.log(`[ai-service] listening on port ${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('[ai-service] GROQ_API_KEY is not set — /triage will return 502 until configured.');
  }
});
