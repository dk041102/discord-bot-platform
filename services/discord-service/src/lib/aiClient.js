import fetch from 'node-fetch';

/**
 * Calls the ai-service to triage/summarize a command's input text.
 *
 * Deliberately isolated in its own microservice so that:
 *  (a) the Groq API key only ever lives in one place,
 *  (b) a slow or down AI provider can never threaten Discord's 3-second
 *      response window for the interactions endpoint itself — this call
 *      happens *after* we've already deferred/responded to Discord,
 *  (c) it can be skipped entirely (AI_SERVICE_URL unset) with zero impact
 *      on the core flow, which matters because the AI step is a stretch
 *      goal, not a dependency the core flow should ever rely on.
 *
 * Returns null on any failure or timeout — callers must treat AI triage as
 * optional enrichment, never as something that can fail the request.
 */
export async function triageWithAI(text) {
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  if (!aiServiceUrl || !text) return null;

  try {
    const res = await fetch(`${aiServiceUrl}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn('[ai] triage call returned non-2xx', res.status);
      return null;
    }

    const data = await res.json();
    return { summary: data.summary ?? null, tags: data.tags ?? [] };
  } catch (err) {
    console.warn('[ai] triage call failed, continuing without it:', err.message);
    return null;
  }
}
