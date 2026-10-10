import type { Pool } from '../shared/types';
import { assetClass, maturity } from './classify';

export interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  apyMean30d?: number | null;
  apyPct7D?: number | null;
  sigma?: number | null;
  ilRisk: 'yes' | 'no' | boolean;
  exposure: 'single' | 'multi';
  underlyingTokens?: string[] | null;
  poolMeta?: string | null;
}

export function normalizePool(raw: LlamaPool): Pool {
  const apy = raw.apy ?? 0;
  const apyBase = raw.apyBase ?? 0;
  const apyReward = raw.apyReward ?? 0;
  return {
    id: raw.pool, project: raw.project, symbol: raw.symbol,
    assetClass: assetClass(raw.symbol, raw.project), tvlUsd: raw.tvlUsd,
    apy, apyBase, apyReward, realApy: apyBase,
    incentiveShare: apy > 0 ? apyReward / apy : 0,
    apyMean30d: raw.apyMean30d ?? null, apyPct7D: raw.apyPct7D ?? null, sigma: raw.sigma ?? null,
    ilRisk: raw.ilRisk === true || raw.ilRisk === 'yes', exposure: raw.exposure,
    maturity: maturity(raw.symbol), underlying: raw.underlyingTokens ?? [], meta: raw.poolMeta ?? null,
  };
}

export async function fetchMonadPools(fetchImpl: typeof fetch = fetch): Promise<Pool[]> {
  const response = await fetchImpl('https://yields.llama.fi/pools');
  if (!response.ok) throw new Error(`DeFiLlama pools HTTP ${response.status}`);
  const body = await response.json() as { data: LlamaPool[] };
  return body.data.filter((row) => row.chain === 'Monad' && row.tvlUsd >= 100_000).map(normalizePool);
}
