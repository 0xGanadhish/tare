import { afterEach, expect, test, vi } from 'vitest';
import { parseAmount, parseIntent } from './intent';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
test.each([
  ['I have 500 USDC, want something safe', 500, 'USDC'], ['$1.5k for 3 months', 1500, null],
  ['2,000 AUSD', 2000, 'AUSD'], ['500usdc', 500, 'USDC'], ['10 MON staking', 10, 'MON'],
  ['safe for 3 months', null, null], ['safe for 30 days with USDC', null, 'USDC'],
  ['USDC 500 for 3 months', 500, 'USDC'], ['1.5k USDC', 1500, 'USDC'],
  ['nothing numeric', null, null], ['$0', 0, null],
])('parseAmount(%s)', (text, amount, asset) => expect(parseAmount(text)).toEqual({ amount, asset }));

test('parseIntent keeps low-confidence choices for the UI to ask the user', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'unit-test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ answers: {
    risk_appetite: { type: 'choice', choice: 'low', confidence: 0.55, probabilities: { low: 0.6, medium: 0.3, high: 0.1 } },
    horizon: { type: 'choice', choice: 'medium', confidence: 0.9, probabilities: { short: 0.05, medium: 0.9, long: 0.05 } },
    asset_pref: { type: 'choice', choice: 'stable', confidence: 0.95, probabilities: { stable: 1, gold: 0, rwa: 0, mon: 0, btc_eth: 0, any: 0 } },
  } })));
  expect(await parseIntent('500 USDC for 3 months')).toEqual({
    text: '500 USDC for 3 months', amount: 500, asset: 'USDC',
    risk: { value: 'low', confidence: 0.55 }, horizon: { value: 'medium', confidence: 0.9 }, assetPref: { value: 'stable', confidence: 0.95 },
  });
});

test('Jev failure preserves parsed facts and exposes manual choices with zero confidence', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'unit-test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  expect(await parseIntent('500usdc')).toEqual({
    text: '500usdc', amount: 500, asset: 'USDC',
    risk: { value: 'low', confidence: 0 }, horizon: { value: 'medium', confidence: 0 }, assetPref: { value: 'any', confidence: 0 },
  });
});
