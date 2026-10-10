import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEvent, readEvents, readPools } from './cache';
import type { WatchEvent } from './types';

const env = { ...process.env };
beforeEach(() => { process.env.CACHE_DIR = mkdtempSync(join(tmpdir(), 'c-')); });
afterEach(() => { process.env = { ...env }; });

test('readPools falls back to fixtures when cache file is missing', async () => {
  const { pools } = await readPools();
  expect(pools.length).toBeGreaterThan(100);
});

test('DATA_SOURCE=fixtures ignores a present cache file', async () => {
  writeFileSync(join(process.env.CACHE_DIR!, 'pools.json'), JSON.stringify({ pools: [], asOf: 'x' }));
  expect((await readPools()).pools.length).toBe(0);
  process.env.DATA_SOURCE = 'fixtures';
  expect((await readPools()).pools.length).toBeGreaterThan(100);
});

test('appendEvent then readEvents(afterId) returns only newer events', async () => {
  const e = (id: string): WatchEvent => ({ id, at: new Date().toISOString(), vault: '0x0000000000000000000000000000000000000001', type: 'judged', message: id });
  await appendEvent(e('e1'));
  await appendEvent(e('e2'));
  expect((await readEvents('e1')).map((x) => x.id)).toEqual(['e2']);
  expect((await readEvents()).length).toBe(2);
});
