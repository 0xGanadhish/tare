import { expect, test, vi } from 'vitest';
import { fetchMonadPools, normalizePool, type LlamaPool } from './indexer';

const raw = (overrides: Partial<LlamaPool> = {}): LlamaPool => ({
  pool: 'pool-1', chain: 'Monad', project: 'euler-v2', symbol: 'USDC', tvlUsd: 100_000,
  apy: 0, apyBase: null, apyReward: null, ilRisk: 'no', exposure: 'single',
  underlyingTokens: ['0x123'], poolMeta: null, ...overrides,
});

test.each([null, 0])('null/zero APY fields produce finite zero derived values (%s)', (apy) => {
  const pool = normalizePool(raw({ apy }));
  expect(pool.realApy).toBe(0);
  expect(pool.incentiveShare).toBe(0);
  expect(pool.apy).toBe(0);
});

test('incentiveShare is rewards divided by headline APY, realApy is base', () => {
  const pool = normalizePool(raw({ apy: 15.68, apyBase: 0.52, apyReward: 15.16 }));
  expect(pool.incentiveShare).toBeCloseTo(0.9668367347);
  expect(pool.realApy).toBe(0.52);
});

test('preserves seven-day change and uses null when missing', () => {
  expect(normalizePool(raw({ apyPct7D: -2.5 })).apyPct7D).toBe(-2.5);
  expect(normalizePool(raw()).apyPct7D).toBeNull();
});

test('normalizes classification, maturity, IL and nullable metadata', () => {
  expect(normalizePool(raw({ symbol: 'PT-AUSD-8OCT2026', ilRisk: 'yes' }))).toMatchObject({
    id: 'pool-1', assetClass: 'rwa', maturity: '2026-10-08', ilRisk: true,
    underlying: ['0x123'], meta: null, apyMean30d: null, sigma: null,
  });
});

test('fetchMonadPools keeps only Monad rows with TVL at least 100,000', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [
    raw(), raw({ pool: 'small', tvlUsd: 99_999 }), raw({ pool: 'other', chain: 'Ethereum' }),
  ] }));
  expect((await fetchMonadPools(fetchImpl)).map((pool) => pool.id)).toEqual(['pool-1']);
});

test('fetchMonadPools rejects HTTP failures rather than returning incomplete data', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
  await expect(fetchMonadPools(fetchImpl)).rejects.toThrow('503');
});
