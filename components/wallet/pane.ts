import { formatUnits } from 'viem';
import type { Network, VaultConfig } from '@/shared/networks';
import type { Address } from '@/shared/types';
import type { FeedEvent } from '@/components/watch/feed';

/** The network's USDC as the UI names it: testnet USDC is a mock, so it is "test USDC". */
export const usdcLabel = (network: Network): string => (network === 'testnet' ? 'test USDC' : 'USDC');

export interface Launch { token: Address; creator: Address; reserveVault: Address; name: string; symbol: string }

/** Tokens `owner` created through LaunchFactory, newest first (the registry is append-only). */
export function myLaunches(launches: readonly Launch[] | undefined, owner: Address): Launch[] {
  if (!launches) return [];
  const me = owner.toLowerCase();
  return launches.filter((l) => l.creator.toLowerCase() === me).reverse();
}

type RuleRead = { status: 'success'; result: readonly [boolean, number, number, bigint] } | { status: 'failure'; error: Error };
export interface ActiveRule { vault: VaultConfig; minConfidenceBps: number; maxAge: number }

/** Enabled GuardianV2 rules, from `rules(owner, vault)` reads in vault order. */
export function activeRules(vaults: VaultConfig[], results: readonly RuleRead[] | undefined): ActiveRule[] {
  if (!results) return [];
  return vaults.flatMap((vault, i) => {
    const r = results[i];
    if (r?.status !== 'success' || !r.result[0]) return [];
    return [{ vault, minConfidenceBps: r.result[1], maxAge: r.result[2] }];
  });
}

export const recentActivity = (events: readonly FeedEvent[], limit: number): FeedEvent[] =>
  [...events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);

export function fmtUnits(raw: bigint | undefined, decimals: number, digits = 2): string {
  if (raw === undefined) return '–';
  return Number(formatUnits(raw, decimals)).toLocaleString('en-US', { maximumFractionDigits: digits });
}
