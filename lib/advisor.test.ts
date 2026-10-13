import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { advise, covered } from './advisor';
import fixture from '../fixtures/pools.json';
import type { Intent, Pool, Verdict } from '../shared/types';
const base = fixture.pools[1] as Pool;
const intent: Intent = { text: '', amount: 500, asset: 'USDC', risk: { value: 'low', confidence: 1 }, horizon: { value: 'medium', confidence: 1 }, assetPref: { value: 'any', confidence: 1 } };
const pool = (id: string, patch: Partial<Pool> = {}): Pool => ({ ...base, id, realApy: 6.5, ...patch });
const verdict = (p: Pool, patch: Partial<Verdict> = {}): Verdict => ({ poolId: p.id, label: 'DEPOSIT', confidence: 0.9, risk: 2, yieldSource: 'organic', band: 'high', flags: [], statsHash: '', judgedAt: '', ...patch });
const verdicts = (pools: Pool[]) => Object.fromEntries(pools.map((p) => [p.id, verdict(p)]));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T00:00:00Z')); });
afterEach(() => vi.useRealTimers());

test('low risk excludes risk above 2, AVOID, and unknown risk', () => {
  const pools = ['safe', 'risky', 'avoid', 'unknown'].map((id) => pool(id));
  const v = verdicts(pools);
  v.risky.risk = 3; v.avoid.label = 'AVOID'; v.unknown.risk = null;
  expect(advise(intent, pools, v, []).map((r) => r.pool.id)).toEqual(['safe']);
});
test('medium allows risk 3; high allows risk 5 but never AVOID', () => {
  const pools = [pool('three'), pool('five')]; const v = verdicts(pools);
  v.three.risk = 3; v.five.risk = 5; v.five.label = 'CONSIDER';
  expect(advise({ ...intent, risk: { value: 'medium', confidence: 1 } }, pools, v, []).map((r) => r.pool.id)).toEqual(['three']);
  expect(advise({ ...intent, risk: { value: 'high', confidence: 1 } }, pools, v, []).map((r) => r.pool.id)).toEqual(['three', 'five']);
});
test('filters by asset preference', () => {
  const pools = [pool('stable'), pool('gold', { assetClass: 'gold' })];
  expect(advise({ ...intent, assetPref: { value: 'gold', confidence: 1 } }, pools, verdicts(pools), []).map((r) => r.pool.id)).toEqual(['gold']);
});
test('drops PT maturity after horizon end, keeps maturity on boundary', () => {
  const pools = [pool('late', { maturity: '2027-04-10' }), pool('boundary', { maturity: '2026-11-09' })];
  expect(advise({ ...intent, horizon: { value: 'short', confidence: 1 } }, pools, verdicts(pools), []).map((r) => r.pool.id)).toEqual(['boundary']);
});
test('ranks base yield descending then TVL, not headline APY, without mutating input', () => {
  const pools = [pool('lower', { realApy: 5, apy: 100 }), pool('smaller', { tvlUsd: 100_000 }), pool('larger', { tvlUsd: 200_000 })];
  expect(advise(intent, pools, verdicts(pools), []).map((r) => r.pool.id)).toEqual(['larger', 'smaller', 'lower']);
  expect(pools.map((p) => p.id)).toEqual(['lower', 'smaller', 'larger']);
});
test('returns top 3 and the exact mirror ahead of the closest asset-class mirror', () => {
  const pools = ['a', 'b', 'c', 'd'].map((id) => pool(id));
  const recommendations = advise(intent, pools, verdicts(pools), [{ address: '0x111', poolId: 'b', mirrorOf: 'Accountable AUSD' }, { address: '0x222', poolId: 'a', mirrorOf: 'Accountable AUSD' }]);
  expect(recommendations.map((r) => r.pool.id)).toEqual(['a', 'b', 'c']);
  expect(recommendations[0].mirrorVault).toBe('0x222');
  expect(recommendations[2].mirrorVault).toBe('0x111');
});
test('medium return uses amount × base yield × 90/365', () => {
  const p = pool('return');
  expect(advise(intent, [p], verdicts([p]), [])[0].expectedReturnUsd).toBeCloseTo(8.01369863);
  expect(advise({ ...intent, amount: null }, [p], verdicts([p]), [])[0].expectedReturnUsd).toBe(0);
});

test('NOT_JUDGED ranks by real APY without pretending risk was assessed', () => {
  const pools = [pool('lower', { realApy: 2 }), pool('higher', { realApy: 5 })];
  const v = Object.fromEntries(pools.map((p) => [p.id, verdict(p, { label: 'NOT_JUDGED', risk: null, confidence: 0 })]));
  const results = advise(intent, pools, v, []);
  expect(results.map((r) => r.pool.id)).toEqual(['higher', 'lower']);
  expect(results[0].verdict).toMatchObject({ label: 'NOT_JUDGED', risk: null, confidence: 0 });
  expect(results[0].fitReasons).toContain('Risk not assessed — Jev unavailable; review before depositing');
});

test('covered lists Tare vaults on the network that the top 3 left out, even above the risk limit, but never AVOID', () => {
  const pools = ['a', 'b', 'c', 'clearstar', 'august', 'avoided', 'elsewhere'].map((id) => pool(id, { realApy: id.length }));
  const v = verdicts(pools);
  v.clearstar.risk = 2.23; v.clearstar.label = 'CONSIDER'; v.avoided.label = 'AVOID';
  const top = advise(intent, pools, v, []);
  const result = covered(intent, pools, v, [], ['clearstar', 'august', 'avoided', 'a'], top.map((r) => r.pool.id));
  expect(top.map((r) => r.pool.id)).toEqual(['elsewhere', 'august', 'a']);
  expect(result.map((r) => r.pool.id)).toEqual(['clearstar']);
  expect(result[0].expectedReturnUsd).toBeCloseTo(500 * 9 / 100 * 90 / 365);
});
test('covered respects the asset preference and the horizon', () => {
  const pools = [pool('stable'), pool('gold', { assetClass: 'gold' }), pool('late', { maturity: '2027-04-10' })];
  const result = covered({ ...intent, assetPref: { value: 'stable', confidence: 1 } }, pools, verdicts(pools), [], ['stable', 'gold', 'late'], []);
  expect(result.map((r) => r.pool.id)).toEqual(['stable']);
});
