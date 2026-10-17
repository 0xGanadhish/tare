import type { Address } from 'viem';
import { ALERT_CONFIDENCE, shouldRejudge } from '../../lib/judge/gating';
import type { Flows } from '../../lib/judge/state';
import type { VaultStats } from '../../shared/types';
import { OracleVerdict } from '../../shared/verdict';

/** Ask Jev again when net outflow over the last hour exceeds this share of TVL (percent). */
export const OUTFLOW_REJUDGE_PCT = 10;
/**
 * Seconds an outflow alone must wait after the vault's last real post before it triggers another. The outflow figure
 * covers the last hour, so one large withdrawal keeps it above the threshold for that whole hour; without this the
 * watcher re-posted the same verdict on every tick (140 EXITs on Clearstar). A stats move still rejudges at once.
 */
export const OUTFLOW_COOLDOWN_S = 3_600;
const ALERT_BPS = Math.round(ALERT_CONFIDENCE * 10_000);

export function decide(input: { stats: VaultStats & { liquidityPct: number | null }; last: VaultStats | null; flows: Flows | null; lastPostAgeS: number | null }): 'rejudge' | 'skip' {
  if (input.lastPostAgeS === null || shouldRejudge(input.last, input.stats)) return 'rejudge';
  const outflow = input.flows !== null && input.flows.netOutPctTvl > OUTFLOW_REJUDGE_PCT;
  return outflow && input.lastPostAgeS >= OUTFLOW_COOLDOWN_S ? 'rejudge' : 'skip';
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
