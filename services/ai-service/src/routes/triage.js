import express from 'express';
import { triageText } from '../lib/groqClient.js';

export const triageRouter = express.Router();

triageRouter.post('/', async (req, res) => {
  const { text } = req.body ?? {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text (string) is required' });
  }

  try {
    const result = await triageText(text);
    return res.json(result);
  } catch (err) {
    console.error('[triage] failed:', err.message);
    // Return a clean 502 rather than crashing — the caller (discord-service)
    // already treats any non-2xx here as "skip AI enrichment, continue
    // without it," so this never breaks the core flow.
    return res.status(502).json({ error: 'triage failed', detail: err.message });
  }
});
