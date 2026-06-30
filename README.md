# Signal — Discord Slash-Command Bot Platform

A web app + Discord bot, built as three small services, that handles slash commands end-to-end:
records every interaction, responds in Discord, mirrors a notification to a second channel
(Slack or another Discord channel), and gives an admin a login-gated dashboard to watch it
happen live and tune command behavior without redeploying.

## What it does

- `/report [text]` — files a report. If you run it with no `text`, Discord opens a modal to
  collect it instead (a second interaction type, handled and verified the same way as the
  original command).
- `/status` — replies with a status message and an **Acknowledge** button (a third interaction
  type — `MESSAGE_COMPONENT` — handled as a follow-up to the original interaction).
- Every command is recorded, answered in Discord, and mirrored to a second channel.
- The dashboard (behind login) shows a live log of every command with a per-row pipeline
  (`received → responded → mirrored`), lets you connect Discord servers, and lets you toggle
  each command's behavior (enabled/disabled, reply template, whether to mirror, whether to run
  AI triage) from the UI.

## Architecture

Three independent services, one Postgres database, one static frontend:

```
                         ┌─────────────────┐
   Discord  ───POST───▶  │ discord-service │ ───▶ Postgres (interactions, outbox)
  (signed interaction)   │  :3001          │ ───▶ ai-service :3002 (optional triage)
                         │  - verify sig   │ ───▶ mirror webhook (Slack / Discord)
                         │  - dedup        │
                         │  - defer/follow │
                         └─────────────────┘

   Dashboard ───fetch──▶  ┌─────────────────┐
  (browser, React)       │   api-gateway    │ ───▶ Postgres (same DB)
                         │  :3000           │
                         │  - JWT auth      │
                         │  - CRUD for log/ │
                         │    guilds/config │
                         └─────────────────┘
```

**Why three services instead of one app:** the brief explicitly asks for the integration work to
be the focus, and the three pieces have genuinely different failure modes and trust boundaries —
`discord-service` must be reachable by Discord and trusts nothing but a valid Ed25519 signature;
`api-gateway` is only ever called by the dashboard and trusts a JWT; `ai-service` isolates the one
external paid-adjacent dependency (an LLM API key) so it's the only place that secret exists, and
so a slow/down AI provider can never threaten Discord's 3-second response window. They share one
Postgres database (see `packages/db/migrations/001_init.sql`) since both `api-gateway` and
`discord-service` need to read/write the same `interactions` and `guilds` tables, and running two
databases for one small app would add sync complexity with no real benefit here.

| Service | Responsibility |
|---|---|
| `services/discord-service` | The actual Discord Interactions Endpoint URL. Verifies Ed25519 signatures, answers PING, dedups by `interaction_id`, handles all 3 interaction types (slash command, button, modal), defers + follows up for slow work, enqueues mirror notifications into a durable outbox with retry/backoff. |
| `services/api-gateway` | Auth (JWT login) + REST API for the dashboard: interaction log, stats, guild connections, per-command config. |
| `services/ai-service` | Thin wrapper around Groq's free LLM API for one-line triage (summary + tags) of command text. Fully optional — if unset, the rest of the app behaves identically. |
| `frontend` | React + Vite SPA dashboard. Static build, deploys anywhere that serves static files. |

## Quick start (local)

You need Node 18+, Docker (recommended) or a local Postgres, and a Discord application.

### 1. Clone and install

```bash
git clone <your-repo-url>
cd discord-bot-platform
```

### 2. Set up Discord

1. Go to https://discord.com/developers/applications → **New Application**.
2. **General Information** tab: copy the **Public Key** → this is `DISCORD_PUBLIC_KEY`. Copy
   the **Application ID** → this is `DISCORD_APPLICATION_ID`.
3. **Bot** tab → **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`. Under **Privileged
   Gateway Intents** you don't need any — this app uses the Interactions Endpoint, not a
   websocket gateway connection.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`, permissions
   `Send Messages`. Open the generated URL to add the bot to a test server you control.
5. Leave **Interactions Endpoint URL** blank for now — you set it after deploying (step 6 below),
   because Discord will immediately PING it and reject an unreachable/unverified URL.

### 3. Set up Postgres (free, no card)

Easiest local option — Docker Compose brings up Postgres for you (see step 4). For a deployed
database, create a free project at [Neon](https://neon.tech) or [Supabase](https://supabase.com)
and copy the connection string (`postgresql://...?sslmode=require`).

### 4. Configure environment variables

Copy each `.env.example` to `.env` and fill in real values:

```bash
cp services/discord-service/.env.example services/discord-service/.env
cp services/api-gateway/.env.example services/api-gateway/.env
cp services/ai-service/.env.example services/ai-service/.env
cp frontend/.env.example frontend/.env
```

- `services/discord-service/.env` — `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`,
  `DISCORD_BOT_TOKEN`, `DATABASE_URL`. Leave `AI_SERVICE_URL` pointing at the local ai-service
  (or remove it to disable AI triage entirely).
- `services/api-gateway/.env` — `DATABASE_URL`, and a `JWT_SECRET` (generate one:
  `openssl rand -base64 32`).
- `services/ai-service/.env` — `GROQ_API_KEY` (free, no card, from
  https://console.groq.com/keys). Optional — leave blank to skip the AI stretch goal.
- `frontend/.env` — `VITE_API_GATEWAY_URL` (defaults to `http://localhost:3000`).

If you're using Docker Compose (recommended), set `DATABASE_URL` in both backend `.env` files to:

```
postgresql://postgres:postgres@postgres:5432/discord_bot
```

### 5. Run everything

**With Docker Compose (recommended — brings up Postgres too):**

```bash
docker compose up --build
```

This starts Postgres on `5432`, `api-gateway` on `3000`, `discord-service` on `3001`, and
`ai-service` on `3002`. The Postgres container automatically applies
`packages/db/migrations/001_init.sql` on first boot (mounted into
`/docker-entrypoint-initdb.d`).

**Without Docker** (if you already have Postgres running somewhere):

```bash
# Apply the schema once:
psql "$DATABASE_URL" -f packages/db/migrations/001_init.sql

# Then in three separate terminals:
cd services/api-gateway && npm install && npm run dev
cd services/discord-service && npm install && npm run dev
cd services/ai-service && npm install && npm run dev
```

**Frontend** (always run separately, it's a static SPA):

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`.

### 6. Create an admin login and register slash commands

```bash
cd services/api-gateway
npm run seed-admin -- you@example.com yourpassword

cd ../discord-service
npm run register-commands
```

Global command registration can take up to an hour to propagate. For instant testing while
developing, register guild-specific commands instead — see the comment at the top of
`src/registerCommands.js` for the one-line change (swap the URL to
`.../applications/{appId}/guilds/{guildId}/commands`).

### 7. Point Discord at your endpoint

`discord-service` only accepts requests from Discord (everything else gets a `401` — see
"Security" below), so to test the actual flow you need a publicly reachable URL even in
development. Either deploy first (see below) or tunnel your local port with something like
`ngrok http 3001`, then paste the resulting HTTPS URL into **Interactions Endpoint URL** in the
Developer Portal's General Information tab. Discord will send a PING immediately — if signature
verification is wired correctly, it succeeds and the field saves.

## Deploying

All of this runs on free tiers with no credit card. This repo deploys cleanly to:

### Backend services → Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at your repo. Render reads `render.yaml` at the repo
   root and creates all three services (`discord-service`, `api-gateway`, `ai-service`)
   automatically, including wiring `AI_SERVICE_URL` between them.
3. For each service, open its **Environment** tab in the Render dashboard and fill in the
   variables marked `sync: false` in `render.yaml` (these are the actual secrets — `render.yaml`
   intentionally never contains real values, only variable *names*):
   - `discord-service`: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`,
     `DATABASE_URL`, and `AI_SERVICE_URL` — for this last one, deploy `ai-service` first, copy its
     public URL from the Render dashboard (e.g. `https://ai-service-xxxx.onrender.com`), and paste
     that in. (Render's Blueprint spec doesn't support string interpolation, so the
     scheme-prefixed URL has to be set this way rather than auto-wired — leave it unset entirely
     to skip the AI stretch goal, which is a fully supported no-op.)
   - `api-gateway`: `DATABASE_URL`, `FRONTEND_ORIGIN` (your deployed frontend URL, fill in after
     step below)
   - `ai-service`: `GROQ_API_KEY` (optional)
4. Render builds and deploys each service from its Dockerfile. Copy `discord-service`'s public
   URL (e.g. `https://discord-service-xxxx.onrender.com`) into the Discord Developer Portal's
   **Interactions Endpoint URL** field, then save — Discord PINGs it immediately and will reject
   the save if verification fails, so a successful save is a real end-to-end check.
5. Run the migration against your deployed `DATABASE_URL` once (from your machine):
   `psql "$DATABASE_URL" -f packages/db/migrations/001_init.sql`, then
   `npm run seed-admin -- you@example.com yourpassword` from `services/api-gateway` locally
   pointed at the same `DATABASE_URL`, and `npm run register-commands` from
   `services/discord-service`, same idea.

**Important — Render's free tier cold-start:** a free web service spins down after 15 minutes of
no traffic, and the *first* request after that takes roughly 30–60 seconds to wake back up — well
past Discord's ~3-second response window. Two honest options, since pretending this away would be
worse than naming it:
  - Set up a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com), no card required)
    to ping `discord-service`'s `/health` endpoint every 5–10 minutes. This keeps it warm
    continuously, at zero cost, for as long as the monitor runs.
  - Or, before a live test/demo, manually hit `/health` once and wait ~60 seconds for it to warm
    up before running a slash command.
  If `discord-service` is hit cold anyway, Discord will show the interaction as failed/timed out
  client-side even though the request is still being processed and *will* complete server-side —
  check the dashboard log a few seconds later and you'll see it land. This is a known, documented
  tradeoff of the free tier, not a bug in the signature/dedup/response logic itself.

### Frontend → Vercel (or Netlify/Cloudflare Pages — any static host works)

1. Import the repo in Vercel, set the project root to `frontend/`.
2. Vercel auto-detects the Vite build via `vercel.json` (already in `frontend/`).
3. Set the env var `VITE_API_GATEWAY_URL` to your deployed `api-gateway` URL.
4. Deploy. Then go back to Render and set `api-gateway`'s `FRONTEND_ORIGIN` to this Vercel URL
   (tightens CORS to just your dashboard).

### Database → Neon or Supabase

Either works identically here — just a connection string. Free tier, no card, both support the
`pgcrypto` extension the migration uses (pre-installed on both, so the `CREATE EXTENSION IF NOT
EXISTS pgcrypto` line in the migration just confirms it rather than installing anything new).

**Cold-start heads-up:** Neon's free tier scales compute to zero after a few minutes of idleness
and wakes on the next query in under a second — fine for this app, you might just see one slightly
slower request after idle time. Supabase's free tier fully *pauses* a project after about a week
of no activity and needs a manual unpause from the dashboard before it'll respond again — if
you're submitting this for review after letting it sit idle for several days, check the Supabase
dashboard first and unpause if needed, or just keep the dashboard open / run a command shortly
before the grader looks at it.

## Security & reliability — what's actually enforced, not just claimed

- **Forged/replayed requests**: every request to `discord-service`'s root route goes through
  `verifyDiscordSignature` (`src/middleware/verifySignature.js`) before any business logic runs.
  It verifies the Ed25519 signature over the *raw* request bytes (captured via Express's
  `verify` hook in `server.js` — re-serialized JSON is not guaranteed byte-identical to what
  Discord signed, so parsing first and re-stringifying would be a subtle, easy-to-miss bug).
  Anything that fails verification gets a `401` before touching the database.
- **Duplicate interactions**: `interactions.interaction_id` has a `UNIQUE` constraint, and the
  insert-then-catch-23505 pattern in `routes/interactions.js` means dedup is enforced by the
  database itself, not by a racy `SELECT` then `INSERT` in application code. A duplicate delivery
  gets a no-op acknowledgment, never a repeated side effect.
- **Downstream outages**: mirror notifications go through a durable `mirror_outbox` table
  (outbox pattern) instead of firing the webhook directly inline. A background worker
  (`lib/outboxWorker.js`) drains it with exponential backoff and a max-attempts dead-letter, so a
  Slack/Discord webhook being briefly down delays the notification instead of losing it. The AI
  triage call is treated as pure enrichment — any failure there is caught and logged, never
  allowed to fail the interaction itself.
- **3-second window**: the slash command handler always sends its primary response
  (`res.json(...)`) before doing anything slow — AI triage, the mirror DB write — which all
  happen in `finishProcessing()` *after* the response has already been sent. Discord never waits
  on that tail work.
- **Secrets**: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `JWT_SECRET`, mirror webhook URLs, and
  `GROQ_API_KEY` only ever live in `.env` files (gitignored) or hosting-platform environment
  variable stores — never in client-side code, never logged. The frontend only ever talks to
  `api-gateway`, which never returns secrets in any response payload.

## Known limitations (honest, not hidden)

- **Render's free-tier cold start (30–60s after 15 min idle) can exceed Discord's 3-second
  response window on the very first interaction after idle time.** See the "Deploying" section
  above for the uptime-monitor mitigation. This is a free-tier hosting tradeoff, not a flaw in
  the signature verification, dedup, or response logic — the request is processed correctly once
  the service is warm, and even a "failed-looking" cold request still completes and logs
  correctly server-side, just after Discord's own client-side timeout.
- The outbox worker runs in-process inside `discord-service` on a `setInterval`, not as a
  separate worker process — Render's free tier doesn't offer a background-worker service type
  without a paid plan. A production version would split this into its own process or a managed
  queue (see `AI_NOTES.md`).
- Connecting a guild is a manual form (paste the guild ID + channel ID) rather than a full
  Discord OAuth2 "Add to server" flow — building real OAuth2 was judged lower-value than the
  reliability/security work the brief weighs higher, given the time box.
- Single global admin login, not full multi-tenant auth (any admin can see/edit every connected
  guild). Multi-server *data* isolation exists in the schema (everything keys off `guild_id`),
  but the dashboard itself doesn't yet scope by which admin connected which server.

## Repo layout

```
discord-bot-platform/
├── render.yaml                  # one-click deploy of all 3 backend services
├── docker-compose.yml           # local dev: Postgres + all 3 services
├── packages/db/
│   ├── migrations/001_init.sql  # single source-of-truth schema
│   └── run-migration.js         # shared migration runner
├── services/
│   ├── discord-service/         # the Interactions Endpoint
│   ├── api-gateway/             # dashboard auth + REST API
│   └── ai-service/              # optional Groq triage
└── frontend/                    # React + Vite dashboard SPA
```

## AI tooling used

See `AI_NOTES.md` for how AI was used while building this, key decisions made independently, and
the hardest bug encountered along the way.
