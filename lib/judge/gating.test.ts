import { expect, test } from 'vitest';
import { decideAction, shouldRejudge } from './gating';
import type { PositionJudgment } from '../../shared/types';

const judgment = (value: 'hold' | 'exit' | 'rotate', confidence: number): PositionJudgment => ({
  action: { value, confidence }, withdrawalRisk: 0, yieldCollapse: 0, statsHash: 'x', at: '',
});
test('decideAction confidence and autopilot thresholds', () => {
  expect(decideAction(judgment('exit', 0.9), true)).toBe('auto_exit');
  expect(decideAction(judgment('exit', 0.95), false)).toBe('alert');
  expect(decideAction(judgment('exit', 0.75), true)).toBe('alert');
  expect(decideAction(judgment('exit', 0.6), true)).toBe('alert');
  expect(decideAction(judgment('exit', 0.5), true)).toBe('info');
  expect(decideAction(judgment('rotate', 0.99), true)).toBe('suggest_rotate');
  expect(decideAction(judgment('rotate', 0.5), true)).toBe('info');
  expect(decideAction(judgment('hold', 1), true)).toBe('info');
});
test('rejudges only beyond strict APY/utilization deltas from last judgment', () => {
  const prev = { apyBps: 500, utilBps: 7100 };
  expect(shouldRejudge(null, prev)).toBe(true);
  expect(shouldRejudge(prev, { apyBps: 540, utilBps: 7400 })).toBe(false);
  expect(shouldRejudge(prev, { apyBps: 550, utilBps: 7600 })).toBe(false);
  expect(shouldRejudge(prev, { apyBps: 449, utilBps: 7100 })).toBe(true);
  expect(shouldRejudge(prev, { apyBps: 500, utilBps: 9200 })).toBe(true);
});
