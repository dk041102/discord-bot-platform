CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS guilds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id            TEXT NOT NULL UNIQUE,      
  guild_name          TEXT,
  primary_channel_id  TEXT,                       
  mirror_type         TEXT NOT NULL DEFAULT 'discord_webhook'
                        CHECK (mirror_type IN ('discord_webhook', 'slack_webhook', 'none')),
  mirror_webhook_url  TEXT,                        
  connected_by        UUID REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


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


CREATE TABLE IF NOT EXISTS interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  TEXT NOT NULL UNIQUE,            
  guild_id        TEXT,
  channel_id      TEXT,
  user_id         TEXT,
  username        TEXT,
  command_name    TEXT NOT NULL,
  command_input   TEXT,                             
  interaction_type INTEGER NOT NULL,                 
  status          TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'responded', 'mirrored', 'failed')),
  response_text   TEXT,
  mirror_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (mirror_status IN ('pending', 'sent', 'failed', 'skipped')),
  ai_summary      TEXT,
  ai_tags         TEXT[],
  error_log       JSONB NOT NULL DEFAULT '[]'::jsonb,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_guild ON interactions (guild_id);
CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions (status);


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


