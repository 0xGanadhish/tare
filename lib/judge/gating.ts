import type { PositionJudgment, VaultStats } from '../../shared/types';

/** Jev must be at least this sure of "exit" for autopilot to withdraw on its own. */
export const AUTO_EXIT_CONFIDENCE = 0.9;
/** Below this, a judgment is only logged. Between this and AUTO_EXIT_CONFIDENCE, an exit call becomes an alert. */
export const ALERT_CONFIDENCE = 0.6;
/** Jev is asked again when APY moves more than this (basis points)... */
export const REJUDGE_APY_BPS = 50;
/** ...or utilization moves more than this (basis points). */
export const REJUDGE_UTIL_BPS = 500;
/** If Jev can't be reached, the worker never exits on its own; it alerts above this utilization (basis points). */
export const FALLBACK_UTIL_BPS = 9_500;

export function decideAction(j: PositionJudgment, autopilot: boolean): 'auto_exit' | 'alert' | 'info' | 'suggest_rotate' {
  if (j.action.confidence < ALERT_CONFIDENCE) return 'info';
  if (j.action.value === 'rotate') return 'suggest_rotate';
  if (j.action.value === 'exit') return autopilot && j.action.confidence >= AUTO_EXIT_CONFIDENCE ? 'auto_exit' : 'alert';
  return 'info';
}

export function shouldRejudge(prev: VaultStats | null, next: VaultStats): boolean {
  return prev === null || Math.abs(next.apyBps - prev.apyBps) > REJUDGE_APY_BPS || Math.abs(next.utilBps - prev.utilBps) > REJUDGE_UTIL_BPS;
}
