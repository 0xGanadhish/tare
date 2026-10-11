import type { Address, WatchEvent } from '@/shared/types';
import type { BackendEvent } from '@/lib/backend';

/**
 * One Watch feed row, from the backend `events` table or the local v1 worker cache.
 * Types: stats_changed, judged, jev_unavailable, alert, posted, exit_sent, exit_confirmed, exit_partial, exit_failed.
 * `exit_partial` messages state what is still locked, e.g. "Partly out: 120.5 USDC still locked".
 */
export interface FeedEvent {
  id: string; at: string; vault: Address; type: string; message: string; txHash: string | null; confidence: number | null;
  judgment?: WatchEvent['judgment'];
}

export const fromBackend = (e: BackendEvent): FeedEvent => ({
  id: e.id, at: e.at, vault: e.vault, type: e.type, message: e.message, txHash: e.txHash, confidence: e.confidence,
});

export const fromWatchEvent = (e: WatchEvent): FeedEvent => ({
  id: e.id, at: e.at, vault: e.vault, type: e.type, message: e.message, txHash: e.txHash ?? null, confidence: e.confidence ?? null, judgment: e.judgment,
});

/** "Partly out" detail for a partial exit, else null. Handles the v1 "… · partial: X still locked" wording. */
export function partialDetail(e: FeedEvent): string | null {
  if (e.type === 'exit_partial') return e.message.replace(/^Partly out:?\s*/i, '');
  if (e.type === 'exit_confirmed' && e.message.includes('still locked')) return e.message.split(' · partial: ')[1] ?? e.message;
  return null;
}

/** Plain wording for Guardian revert reasons that reach the feed. */
const EXIT_ERRORS: [string, string][] = [
  ['VerdictAlreadyUsed', 'already exited on this verdict; Guardian waits for a newer EXIT verdict'],
  ['StaleVerdict', 'the verdict was older than your freshness limit'],
  ['BelowThreshold', "Jev's confidence was below your rule"],
  ['VerdictPredatesEnable', 'the verdict was posted before you turned Guardian on'],
  ['NothingToExit', 'nothing left to withdraw'],
];
export const exitErrorText = (message: string): string => EXIT_ERRORS.find(([k]) => message.includes(k))?.[1] ?? message;
