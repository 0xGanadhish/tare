import { describe, expect, test } from 'vitest';
import { assetClass, maturity } from './classify';

describe('assetClass', () => {
  test.each([
    ['XAUT0', 'neverland', 'gold'], ['PT-AUSD-8OCT2026', 'pendle-v2', 'rwa'],
    ['SYRUPUSDC', 'aave-v3', 'rwa'], ['USDC', 'centrifuge-protocol', 'rwa'],
    ['SHMON', 'shmonad', 'mon'], ['WMON-SHMON-SMON-GMON', 'curve-dex', 'mon'],
    ['CBBTC', 'morpho-blue', 'btc_eth'], ['USDC', 'euler-v2', 'stable'],
    ['EARNAUSD', 'upshift', 'stable'], ['YZM', 'x', 'other'],
    ['xaut0-USDC', 'midas-rwa', 'gold'], ['ETH-USDC', 'x', 'btc_eth'],
  ])('%s on %s → %s', (symbol, project, expected) => {
    expect(assetClass(symbol, project)).toBe(expected);
  });
});

test('maturity parses PT dates only, including leap-year validation', () => {
  expect(maturity('PT-AUSD-8OCT2026')).toBe('2026-10-08');
  expect(maturity('PT-USDC-29FEB2028')).toBe('2028-02-29');
  for (const symbol of ['USDC', 'USDC-8OCT2026', 'PT-AUSD-31FEB2026', 'PT-AUSD-8XYZ2026']) {
    expect(maturity(symbol)).toBeNull();
  }
});
