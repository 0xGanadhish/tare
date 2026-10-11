import type { ScoreVerdict } from '@/shared/score';

/** Oracle `reasons` bits (spec §4.1 + amendment): which grading criteria fired. */
const REASONS: [number, string][] = [[1, 'price drop'], [2, 'TVL drop'], [4, 'liquidity'], [8, 'vault unreadable']];

export const decodeReasons = (mask: number | null): string[] => (mask ? REASONS.filter(([bit]) => (mask & bit) !== 0).map(([, label]) => label) : []);

export type Outcome = { kind: 'pending' | 'adverse' | 'clear'; reasons: string[] };

export function outcomeOf(r: { resolved: boolean; adverse: boolean | null; reasons: number | null }): Outcome {
  if (!r.resolved || r.adverse === null) return { kind: 'pending', reasons: [] };
  return { kind: r.adverse ? 'adverse' : 'clear', reasons: decodeReasons(r.reasons) };
}

const LABELS: ScoreVerdict[] = ['HOLD', 'EXIT', 'MOVE'];
/** Oracle enum (0 HOLD, 1 EXIT, 2 MOVE) → label; unknown values read as HOLD, the no-action verdict. */
export const verdictLabel = (v: number): ScoreVerdict => LABELS[v] ?? 'HOLD';
