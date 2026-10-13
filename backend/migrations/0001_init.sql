-- Guardian v2 backend schema (plan Task 8). Every row carries its network: 'testnet' | 'mainnet'.

CREATE TABLE pools (
  network    TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  id         TEXT NOT NULL,
  json       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (network, id)
);

CREATE TABLE pool_verdicts (
  network   TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  pool_id   TEXT NOT NULL,
  json      TEXT NOT NULL,
  judged_at TEXT NOT NULL,
  PRIMARY KEY (network, pool_id)
);

-- Mirror of TareRiskOracle posts; `id` is the onchain post id.
CREATE TABLE posts (
  network        TEXT    NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  id             INTEGER NOT NULL,
  vault          TEXT    NOT NULL,
  verdict        INTEGER NOT NULL CHECK (verdict IN (0, 1, 2)),
  confidence_bps INTEGER NOT NULL CHECK (confidence_bps BETWEEN 0 AND 10000),
  risk_bps       INTEGER NOT NULL CHECK (risk_bps BETWEEN 0 AND 10000),
  state_hash     TEXT    NOT NULL,
  posted_at      INTEGER NOT NULL, -- unix seconds, from the chain
  tx_hash        TEXT,
  resolved       INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  adverse        INTEGER CHECK (adverse IN (0, 1)),
  reasons        INTEGER,
  drill          INTEGER NOT NULL DEFAULT 0 CHECK (drill IN (0, 1)),
  PRIMARY KEY (network, id)
);
CREATE INDEX posts_by_vault ON posts (network, vault, id);
CREATE INDEX posts_unresolved ON posts (network, resolved, posted_at);

-- One row per (verdict, owner): the primary key is the exit idempotency key.
CREATE TABLE exits (
  network          TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  verdict_id       TEXT NOT NULL,
  owner            TEXT NOT NULL,
  tx_hash          TEXT,
  status           TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'confirmed', 'skipped', 'failed')),
  error            TEXT,
  assets           TEXT,
  remaining_shares TEXT,
  at               TEXT NOT NULL,
  PRIMARY KEY (network, verdict_id, owner)
);

CREATE TABLE events (
  network    TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  id         TEXT NOT NULL PRIMARY KEY,
  owner      TEXT,
  vault      TEXT NOT NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  tx_hash    TEXT,
  confidence REAL,
  at         TEXT NOT NULL
);
CREATE INDEX events_by_owner ON events (network, owner, at);

CREATE TABLE tx_log (
  network  TEXT    NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  key_role TEXT    NOT NULL,
  nonce    INTEGER NOT NULL,
  hash     TEXT    NOT NULL,
  kind     TEXT    NOT NULL,
  status   TEXT    NOT NULL,
  at       TEXT    NOT NULL
);
CREATE INDEX tx_log_by_key ON tx_log (network, key_role, nonce);

CREATE TABLE vault_health (
  network      TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  vault        TEXT NOT NULL,
  last_post_at TEXT,
  last_error   TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (network, vault)
);
