/** Ledger scoring (spec §7), shared by the backend's /v1/ledger/score and the app's Scoreboard. */

export type ScoreVerdict = 'HOLD' | 'EXIT' | 'MOVE';
export type ConfidenceBand = '<80' | '80-89' | '90-94' | '95-100';

export interface ScoreRow {
  verdict: ScoreVerdict;
  confidenceBps: number;
  riskBps: number;
  resolved: boolean;
  /** Null until resolved. */
  adverse: boolean | null;
}

export interface LedgerScore {
  /** Resolved posts counted. */
  n: number;
  /** Mean of (riskBps/10000 − adverse)²; null with no resolved posts. Lower is better. */
  brier: number | null;
  /** Fewer than EARLY_BELOW resolved posts: shown as "early data". */
  early: boolean;
  bands: { band: ConfidenceBand; n: number; hitRate: number | null }[];
  /** Posts left out as repeats of the call before them (see newCalls). Always set by scoreLedger. */
  repeats?: number;
}

/** A post on a vault: its score fields plus where and when (unix seconds) it was posted. */
export interface PostRow extends ScoreRow {
  vault: string;
  postedAt: number;
}

/** A post repeats the call before it when its vault's previous post had the same verdict at most this long before. */
export const REPEAT_WINDOW_S = 3600;

export const EARLY_BELOW = 30;
export const BANDS: ConfidenceBand[] = ['<80', '80-89', '90-94', '95-100'];

export function bandOf(confidenceBps: number): ConfidenceBand {
  if (confidenceBps >= 9500) return '95-100';
  if (confidenceBps >= 9000) return '90-94';
  if (confidenceBps >= 8000) return '80-89';
  return '<80';
}

/** A hit is an EXIT followed by an adverse outcome, or a HOLD/MOVE followed by none. */
export const isHit = (r: Pick<ScoreRow, 'verdict' | 'adverse'>): boolean => (r.verdict === 'EXIT' ? r.adverse === true : r.adverse === false);

/** Keeps each vault's new calls in posting order and counts the repeats it drops. */
export function newCalls<T extends PostRow>(rows: T[]): { calls: T[]; repeats: number } {
  const last = new Map<string, T>();
  const calls: T[] = [];
  for (const r of [...rows].sort((a, b) => a.postedAt - b.postedAt)) {
    const prev = last.get(r.vault);
    if (!prev || prev.verdict !== r.verdict || r.postedAt - prev.postedAt > REPEAT_WINDOW_S) calls.push(r);
    last.set(r.vault, r);
  }
  return { calls, repeats: rows.length - calls.length };
}

/** Scores the given rows; pass rows through newCalls first and hand its repeat count on. */
export function scoreLedger(rows: ScoreRow[], repeats = 0): LedgerScore {
  const resolved = rows.filter((r) => r.resolved && r.adverse !== null);
  const n = resolved.length;
  const brier = n === 0 ? null : resolved.reduce((sum, r) => sum + (r.riskBps / 10000 - (r.adverse ? 1 : 0)) ** 2, 0) / n;
  const bands = BANDS.map((band) => {
    const inBand = resolved.filter((r) => bandOf(r.confidenceBps) === band);
    return { band, n: inBand.length, hitRate: inBand.length === 0 ? null : inBand.filter(isHit).length / inBand.length };
  });
  return { n, brier, early: n < EARLY_BELOW, bands, repeats };
}
