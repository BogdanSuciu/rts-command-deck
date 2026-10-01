-- RTS Command Deck database schema (Postgres / Neon).
-- The API creates these tables automatically on first use (api/_db.js); this file is for reference
-- or for running by hand.

-- One row per key on the board, in board order.
CREATE TABLE IF NOT EXISTS deck_keys (
  id          text PRIMARY KEY,
  position    integer     NOT NULL,
  name        text        NOT NULL,
  faction     text        NOT NULL,              -- terran | protoss | zerg
  kind        text        NOT NULL,              -- synth | voice | file
  preset      text        NOT NULL DEFAULT '',   -- built-in synth sound (kind = synth)
  line        text        NOT NULL DEFAULT '',   -- words to speak (kind = voice)
  hotkey      text        NOT NULL DEFAULT '',
  volume      real        NOT NULL DEFAULT 1,
  pitch       real        NOT NULL DEFAULT 1,
  color       text        NOT NULL DEFAULT '',   -- '' = faction colour
  favorite    boolean     NOT NULL DEFAULT false,
  clips       jsonb       NOT NULL DEFAULT '[]', -- uploaded clips in play order: [{ fileId, name, path }] (path = Blob clips/…)
  play_mode   text        NOT NULL DEFAULT 'order', -- order | random, when a key has several clips
  file_id     text        NOT NULL DEFAULT '',   -- legacy single clip (before multi-clip keys); read, no longer written
  file_name   text        NOT NULL DEFAULT '',
  clip_path   text        NOT NULL DEFAULT '',
  prev_kind   text        NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Board-wide settings; a single row.
CREATE TABLE IF NOT EXISTS deck_settings (
  id        integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  master    real        NOT NULL DEFAULT 0.8,
  saved_at  timestamptz NOT NULL DEFAULT now(),
  tracker   jsonb                                  -- mission tracker: { config, game, templates }
);
