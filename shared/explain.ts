import type { PositionJudgment, Verdict } from './types';
import { AUTO_EXIT_CONFIDENCE } from '../lib/judge/gating';

/** Plain-language wording for Jev's numbers. Every number shown to a user says what it measures. */

const pct = (x: number) => `${Math.round((Number.isFinite(x) ? x : 0) * 100)}%`;

/** "82% sure" */
export function sure(confidence: number): string {
  return `${pct(confidence)} sure`;
}

const ACTION: Record<PositionJudgment['action']['value'], string> = {
  hold: 'hold',
  exit: 'exit',
  rotate: 'move to a better vault',
};

/** "Jev says stay in (64% sure). Chance you can't withdraw in full soon: 53%. Chance the yield collapses: 6%." */
export function explainJudgment(j: PositionJudgment): string {
  return `Jev says ${ACTION[j.action.value]} (${sure(j.action.confidence)}). `
    + `Chance you can't withdraw in full soon: ${pct(j.withdrawalRisk)}. `
    + `Chance the yield collapses: ${pct(j.yieldCollapse)}.`;
}

/** Why an exit call became an alert rather than an automatic exit. */
export function explainExitAlert(confidence: number, autopilotThreshold = AUTO_EXIT_CONFIDENCE): string {
  return `Jev recommends exiting (${sure(confidence)}). Autopilot only acts on its own at ${pct(autopilotThreshold)} or more, so this one is your call.`;
}

const SOURCE: Record<NonNullable<Verdict['yieldSource']>, string> = {
  organic: 'real activity (fees and interest)',
  incentive: 'token rewards',
  mixed: 'a mix of fees and token rewards',
};

/** Rewrites a verdict flag in plain words. Works on flags cached before this wording existed. */
export function explainFlag(f: Verdict['flags'][number]): string {
  const num = Number(f.text.match(/(-?\d+(?:\.\d+)?)(?:\/5)?\s*$/)?.[1]);
  if (f.key === 'yield_source') {
    const src = (Object.keys(SOURCE) as (keyof typeof SOURCE)[]).find((k) => f.text.toLowerCase().includes(k));
    return `Yield comes from ${src ? SOURCE[src] : 'an unknown source'}${f.confidence != null ? ` (${sure(f.confidence)})` : ''}.`;
  }
  if (f.key === 'sustainable' && Number.isFinite(num)) return `Chance this APY lasts the next 30 days: ${pct(num)}.`;
  if (f.key === 'risk' && Number.isFinite(num)) {
    return `Risk ${Number(num.toFixed(1))} out of 5, where 1 is safest${f.confidence != null ? ` (${sure(f.confidence)})` : ''}.`;
  }
  return f.text;
}
