'use client';

import { formatUnits, type Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { abis } from '@/shared/contracts';
import type { NetworkConfig } from '@/shared/networks';

const USDC_DECIMALS = 6;

/**
 * What this wallet already holds across the network's Tare vaults, in USD (USDC assets), for the soft cap.
 * Returns null while loading so callers can hold the cap check rather than under-count.
 */
export function useDepositedUsd(config: NetworkConfig, owner: Address | undefined): number | null {
  const vaults = config.vaults;
  const enabled = Boolean(owner) && vaults.length > 0 && config.features.softCapUsd != null;
  const shares = useReadContracts({
    contracts: vaults.map((v) => ({ address: v.address, abi: abis.erc4626, functionName: 'balanceOf', args: [owner!], chainId: config.chain.id }) as const),
    query: { enabled },
  });
  const assets = useReadContracts({
    contracts: vaults.map((v, i) => ({
      address: v.address, abi: abis.erc4626, functionName: 'convertToAssets',
      args: [(shares.data?.[i]?.result as bigint | undefined) ?? 0n], chainId: config.chain.id,
    }) as const),
    query: { enabled: enabled && Boolean(shares.data) },
  });
  if (!enabled) return 0;
  if (!assets.data) return null;
  return assets.data.reduce((sum, r) => sum + (r.status === 'success' ? Number(formatUnits(r.result as bigint, USDC_DECIMALS)) : 0), 0);
}
