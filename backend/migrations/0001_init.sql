-- 周末去哪* v0.2 backend schema. Timestamps are ms epoch; dates are 'YYYY-MM-DD' (Asia/Shanghai).

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE places (
  id          TEXT PRIMARY KEY,
  city        TEXT NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  district    TEXT NOT NULL,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  indoor      INTEGER NOT NULL,
  avg_cost    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  cover        TEXT,
  date         TEXT NOT NULL,
  start_time   TEXT,
  visibility   TEXT NOT NULL CHECK (visibility IN ('private','link','public')),
  budget_total INTEGER NOT NULL DEFAULT 0,
  budget_mode  TEXT NOT NULL DEFAULT 'AA' CHECK (budget_mode IN ('AA','treat')),
  cap          INTEGER NOT NULL DEFAULT 4,
  closed_at    INTEGER,
  deleted_at   INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_feed ON sessions(visibility, deleted_at, updated_at DESC);
CREATE INDEX idx_sessions_org  ON sessions(organizer_id);

CREATE TABLE stops (
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  idx             INTEGER NOT NULL,
  place_id        TEXT NOT NULL REFERENCES places(id),
  time            TEXT,
  est_cost        INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  backup_place_id TEXT REFERENCES places(id),
  PRIMARY KEY (session_id, idx)
);
CREATE INDEX idx_stops_place ON stops(place_id);

CREATE TABLE members (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('organizer','member')),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX idx_members_user ON members(user_id);

CREATE TABLE entries (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  stop_idx    INTEGER,
  place_id    TEXT REFERENCES places(id),
  author_id   TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('checkin','photo','spend','note','system')),
  text        TEXT,
  photo       TEXT,
  amount      INTEGER,
  rating      INTEGER,
  verified    INTEGER NOT NULL DEFAULT 0,
  distance_m  INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_entries_session ON entries(session_id, created_at DESC);
CREATE INDEX idx_entries_place   ON entries(place_id, type);
CREATE INDEX idx_entries_author  ON entries(author_id, type, created_at DESC);
