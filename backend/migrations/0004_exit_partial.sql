-- Allow exits.status = 'partial': an exit that left shares behind and is queued to try again for the rest.
-- SQLite can't alter a CHECK in place, so the table is rebuilt with the same columns and rows.
CREATE TABLE exits_new (
  network          TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  verdict_id       TEXT NOT NULL,
  owner            TEXT NOT NULL,
  tx_hash          TEXT,
  status           TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'confirmed', 'partial', 'skipped', 'failed')),
  error            TEXT,
  assets           TEXT,
  remaining_shares TEXT,
  at               TEXT NOT NULL,
  PRIMARY KEY (network, verdict_id, owner)
);
INSERT INTO exits_new (network, verdict_id, owner, tx_hash, status, error, assets, remaining_shares, at)
  SELECT network, verdict_id, owner, tx_hash, status, error, assets, remaining_shares, at FROM exits;
DROP TABLE exits;
ALTER TABLE exits_new RENAME TO exits;
