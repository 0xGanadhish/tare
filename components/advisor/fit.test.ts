import { describe, expect, test } from 'vitest';
import { NETWORKS } from '@/shared/networks';
import type { Intent, Pool, Recommendation, Verdict } from '@/shared/types';
import { fitSummary } from './fit';

const intent: Intent = {
  text: '500 USDC, safe, 3 months', amount: 500, asset: 'USDC',
  risk: { value: 'low', confidence: 1 }, horizon: { value: 'medium', confidence: 1 }, assetPref: { value: 'stable', confidence: 1 },
};
const pool = { id: '6e69bba9-5a90-5712-8f5e-2012b57f5daf', project: 'accountable', symbol: 'AUSD', assetClass: 'stable', realApy: 6.74415, maturity: null } as Pool;
const verdict = { label: 'CONSIDER', confidence: 0.55, risk: 1.98 } as Verdict;
const clearstar = NETWORKS.testnet.vaults.find((v) => v.name === 'Clearstar USDC · Euler')!;
const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  pool, verdict, realApy: pool.realApy, expectedReturnUsd: 500 * 6.74415 / 100 * 90 / 365, fitReasons: [], mirrorVault: clearstar.address, ...over,
});

describe('fitSummary', () => {
  test('one plain sentence: rounded return, horizon, and the picks it matches', () => {
    expect(fitSummary(rec(), intent, 'testnet').line).toBe('≈ $8 over 3 months · matches your safe, stablecoin pick');
  });

  test('details carry the rest with rounded numbers and no repeated risk score', () => {
    const { details } = fitSummary(rec(), intent, 'testnet');
    expect(details).toEqual([
      'Base yield 6.7% a year, not counting token rewards',
      'Within your safe limit of risk 2 or less',
      'No end date listed, so it fits 3 months',
      'No Tare vault for this exact pool on testnet. Closest testnet demo vault: Clearstar USDC · Euler',
    ]);
    expect(details.join(' ')).not.toMatch(/6\.74415|1\.98|appetite|asset class/);
  });

  test('no vault note when the pool has its own vault on this network', () => {
    const own = { ...pool, id: clearstar.poolId! };
    expect(fitSummary(rec({ pool: own }), intent, 'testnet').details.join(' ')).not.toMatch(/Tare vault/);
  });

  test('mainnet never points at a testnet demo vault', () => {
    expect(fitSummary(rec(), intent, 'mainnet').details.at(-1)).toBe('No Tare vault for this exact pool on mainnet');
  });

  test('without an amount, any asset, or a verdict', () => {
    const open = { ...intent, amount: null, risk: { value: 'high', confidence: 1 }, assetPref: { value: 'any', confidence: 1 }, horizon: { value: 'long', confidence: 1 } } as Intent;
    const s = fitSummary(rec({ expectedReturnUsd: 0, verdict: { ...verdict, label: 'NOT_JUDGED', risk: null } }), open, 'testnet');
    expect(s.line).toBe('Fits a year · not judged yet, so check it before depositing');
    expect(s.details).toContain('Any asset accepted; this one is a stablecoin');
    const judged = fitSummary(rec({ expectedReturnUsd: 0.4 }), open, 'testnet');
    expect(judged.line).toBe('≈ under $1 over a year · matches your aggressive pick');
    expect(judged.details).toContain('Your aggressive pick accepts any risk short of AVOID');
  });

  test('a maturity inside the horizon is spelled out', () => {
    const dated = { ...pool, maturity: '2026-12-17' };
    expect(fitSummary(rec({ pool: dated }), intent, 'testnet').details).toContain('Ends 17 Dec 2026, inside your 3 months');
  });
});
