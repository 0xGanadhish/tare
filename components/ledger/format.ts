import type { LedgerScore, ScoreVerdict } from '@/shared/score';
import type { Network } from '@/shared/networks';

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

/** Confidence bands with fewer graded verdicts than this are greyed out as "too few to judge". */
export const MIN_BAND_VERDICTS = 5;

export const verdictCount = (n: number): string => `${n} verdict${n === 1 ? '' : 's'}`;

/** The scoreboard's lead line: how many graded verdicts were right, counted back from each band's hit rate. */
export function scoreSummary(score: LedgerScore, network: Network): { right: number; graded: number; sentence: string } {
  const right = score.bands.reduce((sum, b) => sum + Math.round((b.hitRate ?? 0) * b.n), 0);
  const sentence = score.n === 0
    ? `No graded verdicts on ${network} yet.`
    : `Jev was right ${right} of ${score.n} time${score.n === 1 ? '' : 's'}.`;
  return { right, graded: score.n, sentence };
}
