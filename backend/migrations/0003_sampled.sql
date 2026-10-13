-- Mainnet grades on the worst sample (spec §2b). The resolver samples each post twice: when its grading window opens,
-- and again at a random moment it keeps here (unix seconds), so nobody can time a deposit around a known reading.
-- Additive, with constant defaults, so existing rows read as "not sampled" and nothing is rewritten.
ALTER TABLE posts ADD COLUMN sampled INTEGER NOT NULL DEFAULT 0 CHECK (sampled BETWEEN 0 AND 2);
ALTER TABLE posts ADD COLUMN resample_at INTEGER;
