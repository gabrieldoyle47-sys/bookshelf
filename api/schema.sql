-- Bookshelf accounts database (Cloudflare D1).
-- Nothing personal lives in the public repo any more: accounts, shelves,
-- friendships and the watcher's state are all here, behind the Worker.

-- People. `id` names their shelf file and never changes; `username` is what
-- they sign in with; `display_name` is what everyone sees.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',          -- member | admin
  status TEXT NOT NULL DEFAULT 'active',        -- active | suspended | deleted
  colour TEXT,
  look TEXT,                                    -- JSON: palette, font, room...
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  deleted_at TEXT,                              -- purged 30 days after
  last_seen TEXT,                               -- last activity (admin page)
  news_seen TEXT                                -- What's new read up to here
);

-- Signed-in devices. Only a hash of each token is kept, so a copy of the
-- database cannot be used to sign in as anyone.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created TEXT NOT NULL,
  last_used TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- The documents the site reads and writes, by the same paths it always used:
-- profiles/<id>/library.json, series-state.json, authors.json,
-- books-state.json, events.jsonl. `version` stops two saves clobbering.
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated TEXT NOT NULL
);

-- Friendships, one row per pair with the smaller id first.
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  status TEXT NOT NULL,                         -- pending | accepted
  requested_by TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT
);

-- One-time codes that hand a shelf from before accounts to a new account.
CREATE TABLE IF NOT EXISTS claims (
  code TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL,
  profile TEXT NOT NULL,                        -- JSON: name, colour, look
  used_by TEXT,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Counters: Hardcover calls per day, and per person per minute.
CREATE TABLE IF NOT EXISTS usage (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
