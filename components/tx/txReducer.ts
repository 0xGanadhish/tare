export type Hash = `0x${string}`;

export type TxState =
  | { status: 'idle' }
  | { status: 'awaiting_signature' }
  | { status: 'pending'; hash: Hash; sentAt: number }
  | { status: 'confirmed'; hash: Hash; block: bigint; seconds: number }
  | { status: 'failed'; hash?: Hash; reason: string }
  | { status: 'cancelled' };

export type TxEvent =
  | { type: 'start' }
  | { type: 'signed'; hash: Hash; at?: number }
  | { type: 'receipt'; status: 'success' | 'reverted'; block: bigint; at?: number }
  | { type: 'error'; err: unknown }
  | { type: 'reset' };

/** True when the wallet user declined the request (EIP-1193 code 4001 / viem UserRejectedRequestError). */
export function isUserRejection(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur && typeof cur === 'object' && depth < 8; depth++) {
    const e = cur as { name?: string; code?: number | string; message?: string; cause?: unknown };
    if (e.name === 'UserRejectedRequestError' || e.code === 4001 || e.code === 'ACTION_REJECTED') return true;
    if (typeof e.message === 'string' && /user (rejected|denied)/i.test(e.message)) return true;
    cur = e.cause;
  }
  return false;
}

/** Seconds between signing and receipt, to one decimal; never negative. */
export function elapsedSeconds(sentAt: number, at: number): number {
  return Math.max(0, Math.round((at - sentAt) / 100) / 10);
}

/** One short human line for a thrown error. */
export function errorReason(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string } | null;
  const raw = e?.shortMessage ?? e?.message ?? (typeof err === 'string' ? err : 'Transaction failed');
  const line = raw.split('\n')[0].trim() || 'Transaction failed';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

/**
 * Transaction state machine (spec §10). `confirmed` is reachable only from `pending`
 * via a receipt whose status is `success`.
 */
export function txReducer(s: TxState, e: TxEvent): TxState {
  switch (e.type) {
    case 'start':
      return { status: 'awaiting_signature' };
    case 'signed':
      return s.status === 'awaiting_signature' ? { status: 'pending', hash: e.hash, sentAt: e.at ?? 0 } : s;
    case 'receipt': {
      if (s.status !== 'pending') return s;
      if (e.status !== 'success') return { status: 'failed', hash: s.hash, reason: 'Transaction reverted on-chain' };
      const seconds = elapsedSeconds(s.sentAt, e.at ?? s.sentAt);
      return { status: 'confirmed', hash: s.hash, block: e.block, seconds };
    }
    case 'error': {
      if (s.status === 'confirmed') return s;
      if (isUserRejection(e.err)) return { status: 'cancelled' };
      const reason = errorReason(e.err);
      return s.status === 'pending' ? { status: 'failed', hash: s.hash, reason } : { status: 'failed', reason };
    }
    case 'reset':
      return { status: 'idle' };
  }
}
