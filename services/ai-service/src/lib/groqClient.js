import fetch from 'node-fetch';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Free-tier, fast model — good enough for one-line triage of short command text.
const MODEL = 'llama-3.1-8b-instant';

/**
 * Asks Groq's free API for a one-sentence summary and a short list of tags
 * for a piece of command text (e.g. the body of a /report command).
 *
 * Returns { summary, tags } on success. Throws on failure — the caller
 * (routes/triage.js) is responsible for turning that into a clean error
 * response; this function's job is just talking to Groq correctly.
 */
export async function triageText(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const prompt = `You triage short user-submitted messages from a Discord bot. Given the message below, respond with ONLY a JSON object (no markdown, no preamble) of the form {"summary": "<one short sentence>", "tags": ["<tag1>", "<tag2>"]}. Tags should be 1-3 lowercase single-word categories (e.g. bug, question, feedback, urgent, spam).

Message: """${text}"""`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 150,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq API returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '{}';

  try {
    // Strip markdown fences defensively in case the model wraps its JSON anyway.
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 280) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
    };
  } catch (err) {
    throw new Error(`Groq returned unparseable content: ${raw.slice(0, 200)}`);
  }
}
