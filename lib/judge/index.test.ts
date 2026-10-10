import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { judgePool, judgePosition, statsHash } from './index';
import { JevUnavailable } from '../jev';
import { renderPoolState, renderPositionState } from './state';
import fixture from '../../fixtures/pools.json';
import type { Pool, Position } from '../../shared/types';

const pool = fixture.pools[1] as Pool;
const position: Position = { vault: '0x123', mirrorOf: 'Clearstar USDC', shares: '500000000', assets: '500000000', apyBps: 90, utilBps: 9200, autopilot: true, judgment: null };
const input = { position, atDeposit: { apyBps: 630, utilBps: 7100 }, alternative: { name: 'K3 USDC', realApy: 6.1 } };
const answers = {
  yield_source: { type: 'choice', choice: 'organic', confidence: 0.91, probabilities: { organic: 0.92, incentive: 0.02, mixed: 0.06 } },
  sustainable: { type: 'noul', noul: 0.7 },
  risk: { type: 'score', score: 1.05, confidence: 0.84, legend: { '0': 'lowest', '1': 'low', '2': 'medium', '3': 'high', '4': 'highest' }, probabilities: { '0': 0.05, '1': 0.95, '2': 0, '3': 0, '4': 0 } },
};
beforeEach(() => vi.stubEnv('TYPESAFE_API_KEY', 'unit-test'));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('judgePool returns NOT_JUDGED when Jev times out', async () => {
  vi.useFakeTimers();
  const result = judgePool({ ...pool, id: 'timeout' }, { fetchImpl: vi.fn<typeof fetch>(() => Promise.withResolvers<Response>().promise), timeoutMs: 50 });
  await vi.advanceTimersByTimeAsync(50);
  expect(await result).toMatchObject({ label: 'NOT_JUDGED', confidence: 0, risk: null, yieldSource: null });
});
test.each([new Response('oops'), new Response('', { status: 503 }), Response.json({ answers: { ...answers, risk: { type: 'score', score: 99, confidence: 1 } } })])('judgePool fails closed for unavailable or malformed Jev', async (response) => {
  expect(await judgePool({ ...pool, id: 'malformed' }, { fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) })).toMatchObject({ label: 'NOT_JUDGED', risk: null });
});
test('uses probability-weighted risk and peak probability confidence, caching unchanged stats', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ answers }));
  const p = { ...pool, id: 'cache' };
  const verdict = await judgePool(p, { fetchImpl });
  expect(verdict.label).toBe('DEPOSIT');
  expect(verdict.risk).toBeCloseTo(1.95);
  expect(verdict.confidence).toBe(0.91);
  await judgePool(p, { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await judgePool({ ...p, apyBase: p.apyBase + 1 }, { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
test('does not round moderate expected risk down into the DEPOSIT band', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ answers: {
    ...answers, risk: { ...answers.risk, score: 0.7, confidence: 0.59,
      probabilities: { '0': 0, '1': 0.6, '2': 0.4, '3': 0, '4': 0 } },
  } }));
  const verdict = await judgePool({ ...pool, id: 'weighted-boundary' }, { fetchImpl });
  expect(verdict.label).toBe('CONSIDER');
  expect(verdict.risk).toBeCloseTo(2.4);
  expect(verdict.confidence).toBe(0.6);
});
test('failure is not cached, so an available Jev can judge on the next attempt', async () => {
  const p = { ...pool, id: 'retry-after-failure' };
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('oops')).mockResolvedValueOnce(Response.json({ answers }));
  expect((await judgePool(p, { fetchImpl })).label).toBe('NOT_JUDGED');
  expect((await judgePool(p, { fetchImpl })).label).toBe('DEPOSIT');
});
test('statsHash changes with every fact that affects the rendered judgment', () => {
  expect(statsHash(pool)).toBe(statsHash({ ...pool }));
  for (const patch of [{ apy: pool.apy + 1 }, { apyBase: pool.apyBase + 1 }, { util: 1, sigma: 1 }, { meta: 'new' }, { maturity: '2027-01-01' }]) {
    expect(statsHash({ ...pool, ...patch })).not.toBe(statsHash(pool));
  }
});
test('position failures throw so watchdog cannot auto-exit on unavailable Jev', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops')));
  await expect(judgePosition(input)).rejects.toBeInstanceOf(JevUnavailable);
});
test('position answers retain action confidence separately from noul values', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ answers: {
    action: { type: 'choice', choice: 'exit', confidence: 0.92, probabilities: { hold: 0.02, exit: 0.95, rotate: 0.03 } },
    withdrawal_risk: { type: 'noul', noul: 0.8 }, yield_collapse: { type: 'noul', noul: 0.99 },
  } })));
  expect(await judgePosition(input)).toMatchObject({ action: { value: 'exit', confidence: 0.92 }, withdrawalRisk: 0.8, yieldCollapse: 0.99 });
});
