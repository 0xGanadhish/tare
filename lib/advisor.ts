import type { Intent, MirrorInfo, Pool, Recommendation, Verdict } from '../shared/types';
import { assetClass } from './classify';

const horizonDays = { short: 30, medium: 90, long: 365 };

export function advise(intent: Intent, pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): Recommendation[] {
  const days = horizonDays[intent.horizon.value];
  const horizonEnd = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const maxRisk = intent.risk.value === 'low' ? 2 : intent.risk.value === 'medium' ? 3 : Infinity;
  const eligible = pools.filter((p) => {
    const verdict = verdicts[p.id];
    return (intent.assetPref.value === 'any' || p.assetClass === intent.assetPref.value)
      && verdict !== undefined && verdict.label !== 'AVOID'
      && (maxRisk === Infinity || (verdict.risk !== null && verdict.risk <= maxRisk))
      && (p.maturity === null || p.maturity <= horizonEnd);
  });
  eligible.sort((a, b) => b.realApy - a.realApy || b.tvlUsd - a.tvlUsd);
  return eligible.slice(0, 3).map((p) => {
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
        `Risk ${verdicts[p.id].risk ?? 'unknown'}/5; ${intent.risk.value} appetite`,
        `${p.realApy}% base yield, excluding token rewards`,
        p.maturity ? `Matures ${p.maturity}, within your ${days}-day horizon` : `No fixed maturity; ${days}-day horizon`,
        ...(mirror && !exact ? [`Testnet mirror of closest match: ${mirror.mirrorOf}`] : []),
      ],
      mirrorVault: mirror?.address ?? null,
    };
  });
}
