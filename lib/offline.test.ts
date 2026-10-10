import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getAddress } from 'viem';
import type * as Viem from 'viem';
import type { IdleReport, Pool } from '../shared/types';
import fixture from '../fixtures/pools.json';
import { readMarket } from './api';
import { scanAddress } from './idle';
import { writeCache } from '../shared/cache';
const rpc = vi.hoisted(() => ({ getBytecode: vi.fn() }));
vi.mock('viem', async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => rpc }));
let dir: string;
const owner = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const pools = fixture.pools.slice(0, 1) as Pool[];
const report: IdleReport = { address: owner, holdings: [], idleUsd: 0, potentialYearlyUsd: 0, suggestions: [], asOf: '2026-10-10T00:00:00Z' };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tare-offline-'));
  const fixtures = join(dir, 'fixtures');
  await mkdir(fixtures);
  vi.stubEnv('CACHE_DIR', join(dir, 'cache'));
  vi.stubEnv('FIXTURES_DIR', fixtures);
  vi.stubEnv('DATA_SOURCE', '');
  vi.stubEnv('OFFLINE', '1');
  await writeFile(join(fixtures, 'pools.json'), JSON.stringify({ pools, asOf: report.asOf }));
  await writeFile(join(fixtures, 'verdicts.json'), '{}');
  await writeFile(join(fixtures, `scan-${owner}.json`), JSON.stringify(report));
  rpc.getBytecode.mockRejectedValue(new Error('RPC unavailable'));
});
afterEach(async () => { vi.unstubAllEnvs(); vi.clearAllMocks(); await rm(dir, { recursive: true, force: true }); });
test('OFFLINE ignores present market cache without mutating global DATA_SOURCE', async () => {
  await writeCache('pools', { pools: [], asOf: 'stale' });
  expect(await readMarket()).toEqual({ pools, asOf: report.asOf, verdicts: {} });
  expect(process.env.DATA_SOURCE).toBe('');
});
test('offline scan serves the lowercase-address fixture without RPC', async () => {
  expect(await scanAddress(getAddress(owner))).toEqual(report);
  expect(rpc.getBytecode).not.toHaveBeenCalled();
});
test('live scan retries RPC once then serves a matching saved report', async () => {
  vi.stubEnv('OFFLINE', '');
  expect(await scanAddress(owner)).toEqual(report);
  expect(rpc.getBytecode).toHaveBeenCalledTimes(2);
});
test('offline scan without a snapshot fails rather than fabricating holdings', async () => {
  await expect(scanAddress('0x1111111111111111111111111111111111111111')).rejects.toMatchObject({ code: 'ENOENT' });
});
