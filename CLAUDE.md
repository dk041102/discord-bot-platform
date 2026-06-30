# CLAUDE.md

Context file for working on this repo with Claude / Claude Code. Kept exactly as used.

## What this project is

A microservice Discord slash-command bot platform: `discord-service` (Interactions Endpoint),
`api-gateway` (dashboard auth + REST API), `ai-service` (optional Groq triage), and a React
dashboard. See `README.md` for the full architecture and run instructions.

## Ground rules when modifying this codebase

- **Never read `req.body` for signature verification.** `discord-service`'s signature check must
  always run against `req.rawBody` (the raw bytes captured by the `verify` hook in
  `server.js`), never against `JSON.stringify(req.body)`. This bit us once already — see
  `AI_NOTES.md` for the full story. If you're touching `middleware/verifySignature.js` or
  `server.js`, re-read that section first.
- **Dedup is a database constraint, not an app-level check.** Don't replace the
  insert-then-catch-`23505` pattern in `routes/interactions.js` with a `SELECT` then `INSERT` —
  that reintroduces the race condition it was written to avoid.
- **The mirror notification always goes through `mirror_outbox`, never a direct webhook call
  inside the interaction handler.** This is what makes a Slack/Discord outage a delay instead of
  a silent loss. Keep `lib/outboxWorker.js` as the only thing that actually calls
  `sendMirror()`.
- **Nothing slow happens before the primary `res.json(...)` in the slash-command handler.** AI
  triage, the mirror enqueue, and any DB writes beyond the initial insert happen in
  `finishProcessing()`, called after the response is already sent. If you add a new command or
  interaction type, follow the same shape: respond first, do slow work after.
- **No secrets in committed files.** Every `.env` is gitignored; only `.env.example` (with
  placeholder values) is committed. Don't print tokens/keys/webhook URLs in logs, even at debug
  level.
- **Each service has its own `package.json` and its own `node_modules`.** Don't introduce a
  shared `node_modules` or a monorepo tool (Turborepo/Nx/etc.) — the three services are
  deliberately small and independent; that's a feature here, not something to "clean up" by
  merging.

## Conventions

- ES modules (`"type": "module"`) everywhere — no `require()`.
- Plain `pg` with hand-written SQL, no ORM. Queries live next to the route that uses them; the
  one shared artifact is `packages/db/migrations/001_init.sql`.
- Inline styles in the frontend (no CSS framework) — see `frontend/src/styles/tokens.css` for the
  design tokens (colors, fonts) every component should reference via CSS variables rather than
  hardcoding hex values.
- Comments in this codebase explain *why*, not *what* — if you add a non-obvious workaround
  (like the raw-body signature thing), leave a comment explaining the failure mode it avoids, not
  just what the code does.

## Running tests / verifying changes

There's no automated test suite yet (noted as a gap in `AI_NOTES.md`). To sanity-check changes:

1. `docker compose up --build` to bring up everything locally.
2. Use `ngrok http 3001` to expose `discord-service` and point Discord's Interactions Endpoint
   URL at the ngrok URL — saving that field in the Developer Portal is itself a real signature
   verification test, since Discord PINGs it immediately and rejects the save on failure.
3. Run `/status` and `/report` in your test server and confirm: a response appears in Discord,
   the row appears in the dashboard log with `mirrored` status, and the message appears in the
   configured mirror channel.
4. To test the "downstream is down" path, point the guild's mirror webhook URL at something that
   doesn't resolve and confirm the interaction still gets a normal Discord response, with
   `mirror_status` cycling through retries in the `mirror_outbox` table rather than just failing
   silently.
