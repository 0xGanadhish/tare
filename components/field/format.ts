import { sure } from '@/shared/explain';
import type { Pool, Verdict } from '@/shared/types';

const SPECIAL: Record<string, string> = {
  'aave-v3': 'Aave',
  'euler-v2': 'Euler',
  'morpho-blue': 'Morpho',
  'pendle-v2': 'Pendle',
  'curve-dex': 'Curve',
  'centrifuge-protocol': 'Centrifuge',
  'midas-rwa': 'Midas',
  'uniswap-v3': 'Uniswap',
  'uniswap-v4': 'Uniswap',
};

/** `kuru-dex` → "Kuru Dex", with a few well-known overrides. */
export function formatProject(project: string): string {
  if (SPECIAL[project]) return SPECIAL[project];
  return project
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatPoolName(pool: Pick<Pool, 'project' | 'symbol'>): string {
  return `${formatProject(pool.project)} ${pool.symbol}`;
}

export function formatTvl(usd: number): string {
  if (!Number.isFinite(usd)) return '$0';
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(usd >= 1e8 ? 0 : 1)}M`;
  if (usd >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return `$${Math.round(usd)}`;
}

export function formatPct(n: number, digits = 1): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;
}

export function formatConfidence(c: number): string {
  return sure(c);
}

export interface FieldStats {
  pools: number;
  protocols: number;
  tvlUsd: number;
}

export function fieldStats(pools: Pool[]): FieldStats {
  return {
    pools: pools.length,
    protocols: new Set(pools.map((p) => p.project)).size,
    tvlUsd: pools.reduce((s, p) => s + (Number.isFinite(p.tvlUsd) ? p.tvlUsd : 0), 0),
  };
}

/** Two-line leader annotation text for a pool, in the style of the Field mockup. */
export function annotationLines(pool: Pool, verdict: Verdict | undefined): [string, string] {
  const conf = verdict ? formatConfidence(verdict.confidence) : '–';
  if (verdict?.label === 'AVOID') {
    return [`${formatPct(pool.apy)} headline`, `${Math.round(pool.incentiveShare * 100)}% emissions · AVOID ${conf}`];
  }
  if (verdict?.label === 'DEPOSIT') {
    return [formatPoolName(pool), `${formatPct(pool.realApy)} · real yield · DEPOSIT ${conf}`];
  }
  return [formatPoolName(pool), `${formatPct(pool.apy)} · ${verdict?.label ?? 'NOT_JUDGED'} ${conf}`];
}

/**
 * Pick the pools the landing annotates: the biggest DEPOSIT with a real yield and the
 * AVOID pool with the loudest headline APY (ties → higher TVL).
 */
export function pickAnnotations(pools: Pool[], verdicts: Record<string, Verdict>): string[] {
  const deposit = pools
    .filter((p) => verdicts[p.id]?.label === 'DEPOSIT' && p.realApy > 0 && p.apy <= 30)
    .sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
  const avoid = pools
    .filter((p) => verdicts[p.id]?.label === 'AVOID' && p.apy <= 30)
    .sort((a, b) => b.apy - a.apy || b.tvlUsd - a.tvlUsd)[0];
  return [deposit?.id, avoid?.id].filter((x): x is string => Boolean(x));
}
