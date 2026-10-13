-- getLogs fallback for GuardianV2 rules (plan Task 16): a local copy of Enabled/Disabled state and how far it has read.

CREATE TABLE protections (
  network            TEXT    NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  owner              TEXT    NOT NULL,
  vault              TEXT    NOT NULL,
  enabled            INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  min_confidence_bps INTEGER NOT NULL,
  PRIMARY KEY (network, owner, vault)
);
CREATE INDEX protections_by_vault ON protections (network, vault, enabled);

CREATE TABLE log_cursors (
  network TEXT    NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  name    TEXT    NOT NULL,
  block   INTEGER NOT NULL,
  PRIMARY KEY (network, name)
);
