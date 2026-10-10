import type { VerdictLabel } from '@/shared/types';

export const APY_MAX = 30;
export const TVL_MIN = 1e5;
export const TVL_MAX = 2e8;

/** Plot padding in px; the bottom leaves room for the % axis labels. */
export const PAD = { left: 40, right: 20, top: 44, bottom: 28 } as const;

const LOG_MIN = Math.log10(TVL_MIN);
const LOG_MAX = Math.log10(TVL_MAX);

function logTvl(tvlUsd: number): number {
  const t = Number.isFinite(tvlUsd) && tvlUsd > 0 ? Math.log10(tvlUsd) : LOG_MIN;
  return Math.min(LOG_MAX, Math.max(LOG_MIN, t));
}

/** Headline APY (0–30%, clamped) → x in px. */
export function xForApy(apy: number, width: number): number {
  const a = Number.isFinite(apy) ? Math.min(APY_MAX, Math.max(0, apy)) : 0;
  return PAD.left + (a / APY_MAX) * (width - PAD.left - PAD.right);
}

/** log10(TVL) between 1e5 and 2e8 → y in px (bigger TVL = higher on the page). */
export function yForTvl(tvlUsd: number, height = 330): number {
  const f = (logTvl(tvlUsd) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return height - PAD.bottom - f * (height - PAD.bottom - PAD.top);
}

/** Dot radius grows with log TVL: 2.2px at $100k up to ~10.7px at $200M. */
export function radiusForTvl(tvlUsd: number): number {
  return 2.2 + (logTvl(tvlUsd) - LOG_MIN) * 2.6;
}

export const VERDICT_COLORS = {
  DEPOSIT: '#6E54F5',
  AVOID: '#E2552C',
  CONSIDER_RING: '#B9B6C3',
  NOT_JUDGED_RING: '#E6E4DE',
  PRE_SCAN_RING: '#CFCCD6',
} as const;

export function colorForVerdict(label: VerdictLabel): { fill: string | null; stroke: string | null } {
  switch (label) {
    case 'DEPOSIT':
      return { fill: VERDICT_COLORS.DEPOSIT, stroke: null };
    case 'AVOID':
      return { fill: VERDICT_COLORS.AVOID, stroke: null };
    case 'CONSIDER':
      return { fill: null, stroke: VERDICT_COLORS.CONSIDER_RING };
    default:
      return { fill: null, stroke: VERDICT_COLORS.NOT_JUDGED_RING };
  }
}

/** Weigh-in timeline (spec §5): the scan line starts at 700ms and sweeps for 1400ms. */
export const SCAN_START_MS = 700;
export const SCAN_DURATION_MS = 1400;
export const POP_MS = 320;
export const ANNOTATION_FADE_MS = 600;

/** Eased (cubic ease-out) 0→1 position of the scan line at `elapsedMs`. */
export function scanProgress(elapsedMs: number): number {
  const s = Math.min(1, Math.max(0, (elapsedMs - SCAN_START_MS) / SCAN_DURATION_MS));
  return 1 - Math.pow(1 - s, 3);
}

/** Start delay of the fade-in for dot `i` (staggered, < 600ms). */
export function fadeDelay(i: number): number {
  return (i * 53) % 600;
}

/** Small deterministic x-offset (px) so pools with identical APY don't stack exactly. */
export function jitter(i: number): number {
  return (((i * 37) % 17) - 8) * 0.35;
}
