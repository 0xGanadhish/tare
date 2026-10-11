import { createPublicClient, http, type Address } from 'viem';
import { abis } from '../../shared/contracts';
import { NETWORKS, type Network, type VaultConfig } from '../../shared/networks';
import { rpcFor, type Env } from './env';
import type { VaultReading } from './watcher';

/** Withdrawable liquidity as a percent of total assets, two decimals; null when there is no way to read it. */
export function liquidityPct(available: bigint | null, totalAssets: bigint): number | null {
  if (available === null) return null;
  if (totalAssets === 0n) return 100;
  const bps = (available * 10_000n) / totalAssets;
  return Number(bps > 10_000n ? 10_000n : bps) / 100;
}

/**
 * Reads one vault over RPC. Mirrors report APY and utilization directly; real vaults take APY from the
 * latest pool scan and derive utilization from adapter liquidity, so the same re-judge thresholds apply.
 */
export async function readVault(env: Env, network: Network, vault: VaultConfig): Promise<VaultReading> {
  const client = createPublicClient({ chain: NETWORKS[network].chain, transport: http(rpcFor(env, network), { retryCount: 2 }) });
  const address = vault.address as Address;
  const [totalAssets, decimals] = await Promise.all([
    client.readContract({ address, abi: abis.erc4626, functionName: 'totalAssets' }),
    client.readContract({ address, abi: abis.erc4626, functionName: 'decimals' }),
  ]);
  const pps = await client.readContract({ address, abi: abis.erc4626, functionName: 'convertToAssets', args: [10n ** BigInt(decimals)] });
  if (vault.protocol === 'mirror') {
    const [apyBps, utilBps, available] = await Promise.all([
      client.readContract({ address, abi: abis.mirrorVault, functionName: 'apyBps' }),
      client.readContract({ address, abi: abis.mirrorVault, functionName: 'utilizationBps' }),
      client.readContract({ address, abi: abis.mirrorVault, functionName: 'availableLiquidity' }),
    ]);
    return { stats: { apyBps, utilBps, liquidityPct: liquidityPct(available, totalAssets) }, totalAssets, pps };
  }
  const available = vault.adapter
    ? await client.readContract({ address: vault.adapter as Address, abi: abis.liquidityAdapter, functionName: 'availableLiquidity', args: [address] })
    : null;
  const liq = liquidityPct(available, totalAssets);
  const pool = vault.poolId
    ? await env.DB.prepare(`SELECT json FROM pools WHERE network = 'mainnet' AND id = ?`).bind(vault.poolId).first<{ json: string }>()
    : null;
  const apyBps = pool ? Math.round((JSON.parse(pool.json) as { apy: number }).apy * 100) : 0;
  return { stats: { apyBps, utilBps: liq === null ? 0 : Math.round((100 - liq) * 100), liquidityPct: liq }, totalAssets, pps };
}
