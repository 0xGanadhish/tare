import type { Address } from 'viem';
import { ALERT_CONFIDENCE, shouldRejudge } from '../../lib/judge/gating';
import type { Flows } from '../../lib/judge/state';
import type { VaultStats } from '../../shared/types';
import { OracleVerdict } from '../../shared/verdict';

/** Ask Jev again when net outflow over the last hour exceeds this share of TVL (percent). */
export const OUTFLOW_REJUDGE_PCT = 10;
const ALERT_BPS = Math.round(ALERT_CONFIDENCE * 10_000);

export function decide(input: { stats: VaultStats & { liquidityPct: number | null }; last: VaultStats | null; flows: Flows | null; hasPost: boolean }): 'rejudge' | 'skip' {
  if (!input.hasPost || shouldRejudge(input.last, input.stats)) return 'rejudge';
  return input.flows !== null && input.flows.netOutPctTvl > OUTFLOW_REJUDGE_PCT ? 'rejudge' : 'skip';
}

/** Who gets an exit job for this post. Freshness and post-after-enable are left to the contract and the simulation. */
export function afterJudgment(
  post: { verdict: OracleVerdict; confidenceBps: number },
  protections: { owner: Address; minConfidenceBps: number }[],
): { enqueue: Address[]; alert: boolean } {
  if (post.verdict !== OracleVerdict.EXIT) return { enqueue: [], alert: false };
  return {
    enqueue: protections.filter((p) => p.minConfidenceBps <= post.confidenceBps).map((p) => p.owner),
    alert: post.confidenceBps >= ALERT_BPS,
  };
}
