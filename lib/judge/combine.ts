import type { Choice, Verdict } from '../../shared/types';

/** Verdict rules for pools (risk is Jev's 1–5 score, 1 safest; "lasts" is the chance the APY holds for 30 days). */
export const VERDICT_RULES = { avoidRiskAtLeast: 4, avoidRewardsLastsBelow: 0.4, depositRiskAtMost: 2, depositLastsAtLeast: 0.6 } as const;

export function band(confidence: number): 'high' | 'medium' | 'low' {
  return confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
}

export function combineVerdict(a: {
  yieldSource: Choice<'organic' | 'incentive' | 'mixed'>;
  sustainable: number;
  risk: { score: number; confidence: number };
}): Omit<Verdict, 'poolId' | 'statsHash' | 'judgedAt'> {
  const R = VERDICT_RULES;
  const riskAvoid = a.risk.score >= R.avoidRiskAtLeast;
  const incentiveAvoid = a.yieldSource.value === 'incentive' && a.sustainable < R.avoidRewardsLastsBelow;
  const label = riskAvoid || incentiveAvoid ? 'AVOID'
    : a.risk.score <= R.depositRiskAtMost && a.yieldSource.value !== 'incentive' && a.sustainable >= R.depositLastsAtLeast ? 'DEPOSIT' : 'CONSIDER';
  const confidence = riskAvoid ? a.risk.confidence
    : incentiveAvoid ? a.yieldSource.confidence : Math.min(a.yieldSource.confidence, a.risk.confidence);
  return {
    label, confidence, band: band(confidence), risk: a.risk.score, yieldSource: a.yieldSource.value,
    flags: [
      { key: 'yield_source', text: `Yield source: ${a.yieldSource.value}`, confidence: a.yieldSource.confidence },
      { key: 'sustainable', text: `Chance this APY lasts the next 30 days: ${Math.round(a.sustainable * 100)}%` },
      { key: 'risk', text: `Risk: ${a.risk.score}/5`, confidence: a.risk.confidence },
    ],
  };
}
