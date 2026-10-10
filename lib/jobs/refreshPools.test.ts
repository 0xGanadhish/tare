import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../fixtures/pools.json';
import type { Pool, Verdict } from '../../shared/types';
import { readPools, readVerdicts, writeCache } from '../../shared/cache';
import { statsHash } from '../judge';
import { refreshPools } from './refreshPools';

const pools = fixture.pools.slice(0, 5) as Pool[];
const verdict = (pool: Pool): Verdict => ({ poolId: pool.id, label: 'CONSIDER', confidence: 0.7, risk: 3,
  yieldSource: 'mixed', band: 'medium', flags: [], statsHash: statsHash(pool), judgedAt: '2026-10-10T00:00:00Z', source: 'jev' });
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tare-refresh-'));
  vi.stubEnv('CACHE_DIR', dir);
  vi.stubEnv('DATA_SOURCE', '');
  await writeCache('verdicts', Object.fromEntries(pools.map((p) => [p.id, verdict(p)])));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

test('unchanged stats retain prior judgments and timestamps', async () => {
  const judge = vi.fn(async (p: Pool) => verdict(p));
  expect(await refreshPools({ fetchPools: async () => pools, judge })).toEqual({ pools: 5, judged: 0, reused: 5 });
  expect(judge).not.toHaveBeenCalled();
  expect(await readVerdicts()).toEqual(Object.fromEntries(pools.map((p) => [p.id, verdict(p)])));
});
test('only changed pools receive new judgments and fresh cache numbers', async () => {
  const changed = pools.map((p, i) => i < 2 ? { ...p, apyBase: p.apyBase + 1 } : p);
  const judge = vi.fn(async (p: Pool) => ({ ...verdict(p), judgedAt: '2026-10-10T01:00:00Z' }));
  expect(await refreshPools({ fetchPools: async () => changed, judge })).toEqual({ pools: 5, judged: 2, reused: 3 });
  expect(judge.mock.calls.map(([p]) => p.id).sort()).toEqual(changed.slice(0, 2).map((p) => p.id).sort());
  expect((await readPools()).pools).toEqual(changed);
  expect((await readVerdicts())[changed[0].id].statsHash).toBe(statsHash(changed[0]));
});
test('judging is bounded to four active calls while all pools finish', async () => {
  await writeCache('verdicts', {});
  let active = 0;
  let peak = 0;
  const judged: string[] = [];
  const judge = async (p: Pool) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    judged.push(p.id);
    active--;
    return verdict(p);
  };
  expect(await refreshPools({ fetchPools: async () => pools, judge })).toEqual({ pools: 5, judged: 5, reused: 0 });
  expect(peak).toBe(4);
  expect(judged.sort()).toEqual(pools.map((p) => p.id).sort());
});
test('NOT_JUDGED is retried even when the pool stats did not change', async () => {
  await writeCache('verdicts', { [pools[0].id]: { ...verdict(pools[0]), label: 'NOT_JUDGED' } });
  await refreshPools({ fetchPools: async () => [pools[0]], judge: async (p) => verdict(p) });
  expect((await readVerdicts())[pools[0].id].label).toBe('CONSIDER');
});
test('failed pool fetch preserves last usable cache', async () => {
  const original = { pools, asOf: '2026-10-10T00:00:00Z' };
  await writeCache('pools', original);
  await expect(refreshPools({ fetchPools: async () => { throw new Error('Llama down'); } })).rejects.toThrow('Llama down');
  expect(await readPools()).toEqual(original);
});
