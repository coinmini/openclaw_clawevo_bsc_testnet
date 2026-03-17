-- ClawEvo Chat System — Database Init
-- Usage: psql -U bolin -d clawevo_chat -f init-db.sql

CREATE TABLE IF NOT EXISTS chat_messages (
  id          SERIAL PRIMARY KEY,
  sender      TEXT NOT NULL,          -- 0x... wallet address
  content     TEXT NOT NULL,          -- message content (max 200 chars)
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_time ON chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages (sender, created_at DESC);
