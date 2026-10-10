import { describe, expect, it } from 'vitest';
import type { AssetClass, Pool, Verdict, VerdictLabel } from '@/shared/types';
import { pulseStats } from './aggregate';

function pool(id: string, o: Partial<Pool> = {}): Pool {
  return {
    id, project: 'alpha', symbol: id.toUpperCase(), assetClass: 'stable',
    tvlUsd: 100, apy: 10, apyBase: 5, apyReward: 5, apyMean30d: null, sigma: null,
    realApy: 5, incentiveShare: 0.2, apyPct7D: null, ilRisk: false, exposure: 'single',
    maturity: null, underlying: [], meta: null, ...o,
  };
}
function verdict(poolId: string, label: VerdictLabel): Verdict {
  return { poolId, label, confidence: 0.8, risk: null, yieldSource: null, band: 'high', flags: [], statsHash: '', judgedAt: '' };
}

// Six hand-built pools.
const pools: Pool[] = [
  pool('a', { project: 'alpha', tvlUsd: 400, apy: 4, realApy: 4, incentiveShare: 0, assetClass: 'stable', apyPct7D: 0.5 }),
  pool('b', { project: 'alpha', tvlUsd: 100, apy: 40, realApy: 2, incentiveShare: 0.95, assetClass: 'stable', apyPct7D: -3 }),
  pool('c', { project: 'beta', tvlUsd: 300, apy: 8, realApy: 6, incentiveShare: 0.25, assetClass: 'btc_eth', apyPct7D: 1.2 }),
  pool('d', { project: 'beta', tvlUsd: 50, apy: 20, realApy: 3, incentiveShare: 0.6, assetClass: 'mon', apyPct7D: null }),
  pool('e', { project: 'gamma', tvlUsd: 100, apy: 6, realApy: 10, incentiveShare: 0.5, assetClass: 'stable', apyPct7D: 7 }),
  pool('f', { project: 'gamma', tvlUsd: 50, apy: 12, realApy: 1, incentiveShare: 0.8, assetClass: 'mon', apyPct7D: -0.1 }),
];
const verdicts: Record<string, Verdict> = {
  a: verdict('a', 'DEPOSIT'),
  b: verdict('b', 'AVOID'),
  c: verdict('c', 'CONSIDER'),
  d: verdict('d', 'AVOID'),
  e: verdict('e', 'DEPOSIT'),
  // f has no verdict at all
};

describe('pulseStats', () => {
  const s = pulseStats(pools, verdicts);

  it('counts totals', () => {
    expect(s.poolCount).toBe(6);
    expect(s.protocolCount).toBe(3);
    expect(s.tvlTracked).toBe(1000);
  });

  it('emissionHeavyTvlShare = TVL where incentiveShare > 0.5 over total TVL (0.5 itself is not heavy)', () => {
    // heavy: b (100), d (50), f (50) = 200 of 1000
    expect(s.emissionHeavyTvlShare).toBeCloseTo(0.2, 10);
  });

  it('medianRealApy averages the middle two on an even count', () => {
    // sorted realApy: 1,2,3,4,6,10 -> (3+4)/2
    expect(s.medianRealApy).toBe(3.5);
  });

  it('byAssetClass has medians and TVL per class', () => {
    const get = (c: AssetClass) => s.byAssetClass.find((x) => x.assetClass === c)!;
    expect(get('stable')).toEqual({ assetClass: 'stable', headlineApyMedian: 6, realApyMedian: 4, tvl: 600 });
    expect(get('mon')).toEqual({ assetClass: 'mon', headlineApyMedian: 16, realApyMedian: 2, tvl: 100 });
    expect(get('btc_eth').tvl).toBe(300);
    expect(s.byAssetClass.map((x) => x.assetClass)).toEqual(['stable', 'btc_eth', 'mon']);
  });

  it('byProtocol splits TVL per verdict, sums to protocol TVL, sorted by tvl desc', () => {
    expect(s.byProtocol.map((p) => p.project)).toEqual(['alpha', 'beta', 'gamma']);
    expect(s.byProtocol[0]).toEqual({ project: 'alpha', tvl: 500, deposit: 400, consider: 0, avoid: 100, notJudged: 0 });
    expect(s.byProtocol[1]).toEqual({ project: 'beta', tvl: 350, deposit: 0, consider: 300, avoid: 50, notJudged: 0 });
    // missing verdict counts as not judged
    expect(s.byProtocol[2]).toEqual({ project: 'gamma', tvl: 150, deposit: 100, consider: 0, avoid: 0, notJudged: 50 });
    for (const p of s.byProtocol) expect(p.deposit + p.consider + p.avoid + p.notJudged).toBe(p.tvl);
  });

  it('movers: top 5 by absolute change, nulls excluded', () => {
    expect(s.movers.map((m) => m.poolId)).toEqual(['e', 'b', 'c', 'a', 'f']);
    expect(s.movers[0]).toEqual({ poolId: 'e', symbol: 'E', project: 'gamma', apyPct7D: 7 });
    expect(s.movers.some((m) => m.poolId === 'd')).toBe(false);
  });

  it('returns zeros, never NaN, for empty input', () => {
    const e = pulseStats([], {});
    expect(e).toEqual({
      tvlTracked: 0, poolCount: 0, protocolCount: 0, medianRealApy: 0, emissionHeavyTvlShare: 0,
      byAssetClass: [], byProtocol: [], movers: [],
    });
  });

  it('zero total TVL does not divide by zero', () => {
    const z = pulseStats([pool('z', { tvlUsd: 0, incentiveShare: 1 })], {});
    expect(z.emissionHeavyTvlShare).toBe(0);
  });
});
