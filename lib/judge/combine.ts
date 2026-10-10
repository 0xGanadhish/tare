import type { Choice, Verdict } from '../../shared/types';

export function band(confidence: number): 'high' | 'medium' | 'low' {
  return confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
}

export function combineVerdict(a: {
  yieldSource: Choice<'organic' | 'incentive' | 'mixed'>;
  sustainable: number;
  risk: { score: number; confidence: number };
}): Omit<Verdict, 'poolId' | 'statsHash' | 'judgedAt'> {
  const riskAvoid = a.risk.score >= 4;
  const incentiveAvoid = a.yieldSource.value === 'incentive' && a.sustainable < 0.4;
  const label = riskAvoid || incentiveAvoid ? 'AVOID'
    : a.risk.score <= 2 && a.yieldSource.value !== 'incentive' && a.sustainable >= 0.6 ? 'DEPOSIT' : 'CONSIDER';
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
