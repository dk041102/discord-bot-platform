# AI_NOTES.md

## Tools used

Claude (this conversation, Claude.ai's agentic code tool) generated the full scaffold — all three
services, the migration, and the dashboard — from the brief and a short set of my own
architecture decisions. I reviewed and adjusted the generated code rather than writing every line
from scratch, focusing my own time on the integration points (Discord Developer Portal setup,
webhook URLs, the deploy pipeline) that no amount of generated code can verify without actually
running against live services.

Split, roughly: ~70% AI-generated code (route handlers, the schema, the dashboard UI, Dockerfiles),
~30% me — choosing the architecture, picking the dedup strategy, configuring and testing the
actual Discord/Render/Neon integration end-to-end, and fixing the bug described below.

## Key decisions I made myself

1. **Outbox pattern for the mirror notification, not a direct webhook call inside the request
   handler.** The brief's quality bar explicitly calls out "should not silently lose an
   interaction if a downstream call... is briefly unavailable." A direct `fetch()` to the Slack/
   Discord webhook inside the interaction handler would satisfy the happy path but fail that
   exact requirement the moment the webhook endpoint hiccups. Writing the mirror payload to a
   durable table first, with a separate retrying worker, was the deliberate fix — it's more code
   than a one-line webhook call, but it's the difference between "looks done" and "actually
   survives the unhappy path the brief is grading for."

2. **Database-level dedup (`UNIQUE` constraint + catch the `23505` error) instead of an
   application-level `SELECT` then `INSERT`.** My first instinct (and the AI's first draft) was a
   `SELECT ... WHERE interaction_id = $1` check before inserting. That's a race condition:
   Discord can and does deliver the same interaction twice in quick succession, and two concurrent
   requests can both pass the `SELECT` before either's `INSERT` lands. Letting Postgres's unique
   constraint be the actual source of truth, and treating the constraint violation as the
   "this is a duplicate" signal, removes the race entirely.

3. **Three separate services instead of one monolith with internal modules.** I went back and
   forth on this — a monolith would've been faster to build and is arguably "enough" for a 72-hour
   exercise. I split it anyway because the brief frames the integration work itself as the thing
   being graded, and the three pieces have genuinely different trust boundaries (Discord-signed
   requests vs. JWT-authed dashboard calls vs. an isolated paid-adjacent AI key) that are easier to
   reason about, and harder to accidentally leak across, when they're separate processes with
   separate env vars rather than one shared `process.env`.

## The hardest bug / wrong turn

The first version of the Discord signature verification the AI produced did the standard,
reasonable-looking thing: `app.use(express.json())` globally, then read `req.body` in the
verification middleware, `JSON.stringify()` it back, and verify the signature against that
re-stringified string plus the timestamp.

It looked correct in isolation and even passed a hand-rolled unit test where I generated a
signature myself by signing `timestamp + JSON.stringify(testPayload)` and checking that
verification passed against the same re-stringified body — of course it passed, because I'd
signed the exact string it was checking against.

It failed against real Discord PING requests with `invalid request signature` every time, and the
endpoint never saved in the Developer Portal. The actual cause: Discord signs the *exact bytes it
sent over the wire* — and `JSON.stringify(JSON.parse(rawBody))` is not guaranteed to reproduce
those bytes. Key order, number formatting, and whitespace can all differ after a parse-then-
restringify round trip, even though the parsed object is "equal" in JS terms. My test had signed
the re-stringified version, so it could never have caught this — I was testing the wrong
assumption, not just the wrong code.

I noticed it because the Developer Portal kept rejecting the endpoint save with no useful error
message beyond "verification failed," and logging the actual computed vs. received signature
showed they genuinely didn't match on real Discord traffic, even though my synthetic test passed
every time — a sign the test wasn't exercising the real bytes path at all.

The fix was to capture the raw request body via Express's `verify` hook on `express.json()`
*before* parsing (`req.rawBody = buf.toString('utf8')` in `server.js`), and verify against that
raw string rather than anything derived from the parsed object. The lesson that stuck: for any
signature scheme, verify against literally the bytes that were signed, never against a
re-serialization of them, and don't trust a self-authored test that signs the same transformed
value it later checks — that test can pass for the wrong reason. The comment block at the top of
`middleware/verifySignature.js` documents this explicitly so it doesn't get "fixed" back to the
broken version later by someone (human or AI) who sees `req.body` sitting right there and reaches
for the obvious-looking shortcut.

## What I'd improve with more time

- Move off Render's free tier (or add a paid Starter instance for `discord-service` specifically)
  to eliminate the 15-minute-idle / 30-60s cold-start risk against Discord's 3-second window
  entirely, rather than relying on an external uptime monitor to keep it warm. The monitor
  approach works and costs nothing, but it's a workaround for a hosting constraint, not a real
  fix — a few dollars a month removes the whole class of problem.
- Replace the in-process `setInterval` outbox worker with a real background worker process (or a
  managed queue like a free-tier Upstash QStash) so retries don't compete with request handling
  in the same event loop, and survive more cleanly across deploys.
- Build the actual Discord OAuth2 "Add to Server" flow for connecting a guild, instead of the
  admin pasting the guild ID manually — better UX, and it would let the dashboard verify the bot
  is actually present in that guild before saving the config.
- Add structured logging (e.g. pino, with a request ID threaded through discord-service →
  ai-service) instead of plain `console.log`/`console.error`, plus a visible "recent failures and
  retries" panel in the dashboard pulling from `mirror_outbox`'s dead-lettered rows — the data's
  already there, the outbox table just isn't surfaced in the UI yet.
- Per-admin guild scoping, so multiple admins don't share one global view of every connected
  server.

## Illuminating prompt excerpt

When debugging the signature issue, the prompt that actually got useful output (instead of more
guessing about hex encoding) was specific about *where* to look rather than what to fix:

> "Don't change the verification logic again. Show me, byte for byte, what Express's JSON body
> parser does to the request body between the socket and `req.body` — is there any transformation
> at all between the wire and the parsed object, and is there a way to get the pre-parse bytes
> instead?"

That reframing — asking what Express does to the bytes, instead of asking why the signature check
"isn't working" — is what led to the `verify` hook fix, rather than another round of swapping hex
encodings or byte orders that wouldn't have touched the actual cause.
