import type { PositionJudgment, VaultStats } from '../../shared/types';

export function decideAction(j: PositionJudgment, autopilot: boolean): 'auto_exit' | 'alert' | 'info' | 'suggest_rotate' {
  if (j.action.confidence < 0.6) return 'info';
  if (j.action.value === 'rotate') return 'suggest_rotate';
  if (j.action.value === 'exit') return autopilot && j.action.confidence >= 0.9 ? 'auto_exit' : 'alert';
  return 'info';
}

export function shouldRejudge(prev: VaultStats | null, next: VaultStats): boolean {
  return prev === null || Math.abs(next.apyBps - prev.apyBps) > 50 || Math.abs(next.utilBps - prev.utilBps) > 500;
}
