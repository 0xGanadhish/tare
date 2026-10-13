-- Mainnet grades on the worst sample (spec §2b): the resolver sends one sample() per post when its window opens.
-- Additive, with a constant default, so existing rows read as "not sampled" and nothing is rewritten.
ALTER TABLE posts ADD COLUMN sampled INTEGER NOT NULL DEFAULT 0 CHECK (sampled IN (0, 1));
