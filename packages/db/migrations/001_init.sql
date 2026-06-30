-- ============================================================================
-- Discord Slash-Command Bot Platform — initial schema
-- Works on Neon / Supabase / any vanilla Postgres 14+
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+ core (no extension needed on
-- modern Postgres), but pgcrypto provides it too and this CREATE EXTENSION
-- is a harmless no-op if it's already built in or already enabled — kept as
-- a defensive guard since not every managed Postgres provider configures
-- identically out of the box.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin users for the dashboard (simple email+password auth, bcrypt hashed)
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per Discord server (guild) the admin has connected.
-- Multi-server support: every other table hangs off guild_id.
CREATE TABLE IF NOT EXISTS guilds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id            TEXT NOT NULL UNIQUE,        -- Discord snowflake
  guild_name          TEXT,
  primary_channel_id  TEXT,                        -- where bot replies/posts
  mirror_type         TEXT NOT NULL DEFAULT 'discord_webhook'
                        CHECK (mirror_type IN ('discord_webhook', 'slack_webhook', 'none')),
  mirror_webhook_url  TEXT,                        -- Slack incoming webhook OR Discord webhook URL
  connected_by        UUID REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-guild, per-command configuration (the "configurable rules" stretch goal).
-- rule_config is freeform JSON so the dashboard can add fields without a migration.
CREATE TABLE IF NOT EXISTS command_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  command_name TEXT NOT NULL,                      -- e.g. 'report', 'status'
  enabled      BOOLEAN NOT NULL DEFAULT true,
  reply_template TEXT NOT NULL DEFAULT 'Got it: {input}',
  mirror_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_triage_enabled BOOLEAN NOT NULL DEFAULT false,
  rule_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, command_name)
);

-- The interaction log — the heart of the dashboard and of dedup.
-- interaction_id is Discord's unique id per delivery attempt; UNIQUE constraint
-- is what makes dedup atomic and race-safe (not just an app-level check).
CREATE TABLE IF NOT EXISTS interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  TEXT NOT NULL UNIQUE,             -- Discord interaction.id — dedup key
  guild_id        TEXT,
  channel_id      TEXT,
  user_id         TEXT,
  username        TEXT,
  command_name    TEXT NOT NULL,
  command_input   TEXT,                              -- raw option text, e.g. /report <text>
  interaction_type INTEGER NOT NULL,                  -- 2=APPLICATION_COMMAND, 3=COMPONENT, 5=MODAL_SUBMIT
  status          TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'responded', 'mirrored', 'failed')),
  response_text   TEXT,
  mirror_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (mirror_status IN ('pending', 'sent', 'failed', 'skipped')),
  ai_summary      TEXT,
  ai_tags         TEXT[],
  error_log       JSONB NOT NULL DEFAULT '[]'::jsonb, -- append-only list of {at, stage, message}
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_guild ON interactions (guild_id);
CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions (status);

-- Outbox for mirror notifications — lets a worker retry deliveries that failed
-- because the second channel was briefly unavailable, without losing the event.
CREATE TABLE IF NOT EXISTS mirror_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  TEXT NOT NULL REFERENCES interactions(interaction_id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'dead')),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON mirror_outbox (status, next_attempt_at)
  WHERE status = 'pending';

-- Seed default command configs helper is done in app code on guild connect,
-- not here, since it needs the guild's UUID.
