import type { AssetClass, Pool, Verdict } from '@/shared/types';

export interface PulseStats {
  tvlTracked: number;
  poolCount: number;
  protocolCount: number;
  medianRealApy: number;
  emissionHeavyTvlShare: number;
  byAssetClass: { assetClass: AssetClass; headlineApyMedian: number; realApyMedian: number; tvl: number }[];
  byProtocol: { project: string; tvl: number; deposit: number; consider: number; avoid: number; notJudged: number }[];
  movers: { poolId: string; symbol: string; project: string; apyPct7D: number }[];
}

const num = (n: number) => (Number.isFinite(n) ? n : 0);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.map(num).sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function pulseStats(pools: Pool[], verdicts: Record<string, Verdict>): PulseStats {
  const tvlTracked = pools.reduce((s, p) => s + num(p.tvlUsd), 0);
  const heavyTvl = pools.reduce((s, p) => s + (p.incentiveShare > 0.5 ? num(p.tvlUsd) : 0), 0);

  const classes = new Map<AssetClass, Pool[]>();
  const protocols = new Map<string, PulseStats['byProtocol'][number]>();
  for (const p of pools) {
    classes.set(p.assetClass, [...(classes.get(p.assetClass) ?? []), p]);
    const row = protocols.get(p.project) ?? { project: p.project, tvl: 0, deposit: 0, consider: 0, avoid: 0, notJudged: 0 };
    const tvl = num(p.tvlUsd);
    row.tvl += tvl;
    const label = verdicts[p.id]?.label;
    if (label === 'DEPOSIT') row.deposit += tvl;
    else if (label === 'CONSIDER') row.consider += tvl;
    else if (label === 'AVOID') row.avoid += tvl;
    else row.notJudged += tvl;
    protocols.set(p.project, row);
  }

  const byAssetClass = [...classes.entries()]
    .map(([assetClass, ps]) => ({
      assetClass,
      headlineApyMedian: median(ps.map((p) => p.apy)),
      realApyMedian: median(ps.map((p) => p.realApy)),
      tvl: ps.reduce((s, p) => s + num(p.tvlUsd), 0),
    }))
    .sort((a, b) => b.tvl - a.tvl);

  const movers = pools
    .filter((p): p is Pool & { apyPct7D: number } => typeof p.apyPct7D === 'number' && Number.isFinite(p.apyPct7D))
    .sort((a, b) => Math.abs(b.apyPct7D) - Math.abs(a.apyPct7D))
    .slice(0, 5)
    .map((p) => ({ poolId: p.id, symbol: p.symbol, project: p.project, apyPct7D: p.apyPct7D }));

  return {
    tvlTracked,
    poolCount: pools.length,
    protocolCount: protocols.size,
    medianRealApy: median(pools.map((p) => p.realApy)),
    emissionHeavyTvlShare: tvlTracked > 0 ? heavyTvl / tvlTracked : 0,
    byAssetClass,
    byProtocol: [...protocols.values()].sort((a, b) => b.tvl - a.tvl),
    movers,
  };
}
