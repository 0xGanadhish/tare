import type { Address, WatchEvent } from '@/shared/types';
import type { BackendEvent } from '@/lib/backend';

/**
 * One Watch feed row, from the backend `events` table or the local v1 worker cache.
 * Types: stats_changed, judged, alert, posted, exit_sent, exit_confirmed, exit_partial, exit_failed.
 * `exit_partial` messages state what is still locked, e.g. "120.5 USDC still locked".
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
  if (e.type === 'exit_partial') return e.message;
  if (e.type === 'exit_confirmed' && e.message.includes('still locked')) return e.message.split(' · partial: ')[1] ?? e.message;
  return null;
}
