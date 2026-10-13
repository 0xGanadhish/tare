import type { Intent, MirrorInfo, Pool, Recommendation, Verdict } from '../shared/types';
import { assetClass } from './classify';

const horizonDays = { short: 30, medium: 90, long: 365 };

const horizonEnd = (intent: Intent) => new Date(Date.now() + horizonDays[intent.horizon.value] * 86_400_000).toISOString().slice(0, 10);
const fitsAssetAndHorizon = (intent: Intent, p: Pool) =>
  (intent.assetPref.value === 'any' || p.assetClass === intent.assetPref.value) && (p.maturity === null || p.maturity <= horizonEnd(intent));
const byYield = (a: Pool, b: Pool) => b.realApy - a.realApy || b.tvlUsd - a.tvlUsd;

export function advise(intent: Intent, pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): Recommendation[] {
  const maxRisk = intent.risk.value === 'low' ? 2 : intent.risk.value === 'medium' ? 3 : Infinity;
  const eligible = pools.filter((p) => {
    const verdict = verdicts[p.id];
    return fitsAssetAndHorizon(intent, p)
      && verdict !== undefined && verdict.label !== 'AVOID'
      && (verdict.label === 'NOT_JUDGED' || maxRisk === Infinity || (verdict.risk !== null && verdict.risk <= maxRisk));
  });
  eligible.sort(byYield);
  return eligible.slice(0, 3).map((p) => recommend(intent, p, pools, verdicts, mirrors));
}

/**
 * Pools with a Tare vault on the network (`poolIds`) that the top picks (`exclude`) left out, so the Advisor can always
 * offer a deposit with Guardian. Ranked by yield like the top picks; above-limit risk is kept (the card says so), AVOID never.
 */
export function covered(
  intent: Intent, pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[], poolIds: string[], exclude: string[],
): Recommendation[] {
  return pools
    .filter((p) => poolIds.includes(p.id) && !exclude.includes(p.id) && fitsAssetAndHorizon(intent, p)
      && verdicts[p.id] !== undefined && verdicts[p.id].label !== 'AVOID')
    .sort(byYield)
    .map((p) => recommend(intent, p, pools, verdicts, mirrors));
}

function recommend(intent: Intent, p: Pool, pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): Recommendation {
  const days = horizonDays[intent.horizon.value];
  const exact = mirrors.find((m) => m.poolId === p.id);
  let closest: MirrorInfo | undefined;
  let distance = Infinity;
  if (!exact) {
    for (const mirror of mirrors) {
      const source = pools.find((candidate) => candidate.id === mirror.poolId);
      if ((source?.assetClass ?? assetClass(mirror.mirrorOf, '')) !== p.assetClass) continue;
      const delta = source ? Math.abs(source.realApy - p.realApy) : Infinity;
      if (!closest || delta < distance) { closest = mirror; distance = delta; }
    }
  }
  const mirror = exact ?? closest;
  return {
    pool: p, verdict: verdicts[p.id], realApy: p.realApy,
    expectedReturnUsd: (intent.amount ?? 0) * p.realApy / 100 * days / 365,
    fitReasons: [
      `${p.assetClass} asset class${intent.assetPref.value === 'any' ? ' (any accepted)' : ' matches your preference'}`,
      verdicts[p.id].label === 'NOT_JUDGED' ? 'Risk not assessed — Jev unavailable; review before depositing'
        : `Risk ${verdicts[p.id].risk ?? 'unknown'}/5; ${intent.risk.value} appetite`,
      `${p.realApy}% base yield, excluding token rewards`,
      p.maturity ? `Matures ${p.maturity}, within your ${days}-day horizon` : `No fixed maturity; ${days}-day horizon`,
      ...(mirror && !exact ? [`Testnet mirror of closest match: ${mirror.mirrorOf}`] : []),
    ],
    mirrorVault: mirror?.address ?? null,
  };
}
