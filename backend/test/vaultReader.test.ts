import { env } from 'cloudflare:test';
import { maxUint256 } from 'viem';
import { describe, expect, it } from 'vitest';
import type { VaultConfig } from '../../shared/networks';
import { liquidityPct, readVault, type ReadClient } from '../src/vaultReader';

const ORACLE = '0x00000000000000000000000000000000000000f0' as const;
const mirror: VaultConfig = { address: '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC', name: 'Clearstar USDC · Euler', poolId: 'p', protocol: 'mirror', adapter: null };
const morpho: VaultConfig = { address: '0x00000000000000000000000000000000000000e2', name: 'August USDC', poolId: 'pm', protocol: 'morpho', adapter: null };

function client(values: Record<string, unknown>): ReadClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    readContract: (async ({ functionName }: { functionName: string }) => {
      calls.push(functionName);
      if (!(functionName in values)) throw new Error(`unexpected ${functionName}`);
      return values[functionName];
    }) as ReadClient['readContract'],
  };
}

describe('vault reader', () => {
  it('liquidityPct rounds down to 2 decimals and caps at 100', () => {
    expect(liquidityPct(123_456n, 1_000_000n)).toBe(12.34);
    expect(liquidityPct(2_000_000n, 1_000_000n)).toBe(100);
    expect(liquidityPct(null, 1n)).toBeNull();
  });

  it('a mirror reads metrics from the oracle plus its own APY and utilization', async () => {
    const c = client({ metricsOf: [1_010_000n, 1_000_000_000n, 50_000_000n], apyBps: 640, utilizationBps: 9500 });
    const r = await readVault(env, 'testnet', mirror, { client: c, oracle: ORACLE });
    expect(r).toEqual({ stats: { apyBps: 640, utilBps: 9500, liquidityPct: 5 }, totalAssets: 1_000_000_000n, pps: 1_010_000n });
    expect(c.calls.sort()).toEqual(['apyBps', 'metricsOf', 'utilizationBps']);
  });

  it('a real vault without an adapter: APY from the pool scan, liquidity unknown', async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO pools (network, id, json, updated_at) VALUES ('mainnet', 'pm', '{"apy": 6.42}', 'now')`).run();
    const c = client({ metricsOf: [1_000_000n, 5_000_000n, maxUint256] });
    expect(await readVault(env, 'mainnet', morpho, { client: c, oracle: ORACLE }))
      .toEqual({ stats: { apyBps: 642, utilBps: 0, liquidityPct: null }, totalAssets: 5_000_000n, pps: 1_000_000n });
  });

  it('before the oracle is deployed, reads the vault directly', async () => {
    const c = client({ totalAssets: 1_000n, decimals: 6, convertToAssets: 1_000_000n, apyBps: 500, utilizationBps: 5000, availableLiquidity: 500n });
    const r = await readVault(env, 'testnet', mirror, { client: c, oracle: null });
    expect(r).toEqual({ stats: { apyBps: 500, utilBps: 5000, liquidityPct: 50 }, totalAssets: 1_000n, pps: 1_000_000n });
  });
});
