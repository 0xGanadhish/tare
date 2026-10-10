'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useReducer, useRef } from 'react';
import { useConfig } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { elapsedSeconds, txReducer, type Hash, type TxState } from './txReducer';

export interface ConfirmedTx {
  hash: Hash;
  block: bigint;
  seconds: number;
}

export interface UseTxOptions {
  /** Called only after a receipt with status `success` (balances are already being re-read). */
  onConfirmed?: (tx: ConfirmedTx) => void;
}

/**
 * Receipt-backed transaction runner (spec §10).
 * `run(write)` calls `write()` (e.g. wagmi `writeContractAsync`), then waits for the receipt.
 * State is `confirmed` only when the receipt status is `success`; every chain read cached by
 * react-query is invalidated afterwards so balances come back from the chain, not from guesses.
 */
export function useTx(opts: UseTxOptions = {}): { state: TxState; run: (write: () => Promise<Hash>) => Promise<void>; reset: () => void } {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(txReducer, { status: 'idle' } as TxState);
  const busy = useRef(false);
  const onConfirmed = useRef(opts.onConfirmed);
  onConfirmed.current = opts.onConfirmed;

  const run = useCallback(
    async (write: () => Promise<Hash>) => {
      if (busy.current) return;
      busy.current = true;
      dispatch({ type: 'start' });
      let hash: Hash | undefined;
      let sentAt = 0;
      try {
        hash = await write();
        sentAt = Date.now();
        dispatch({ type: 'signed', hash, at: sentAt });
        // Monad blocks are 400ms: poll fast so "Confirmed in 0.6s" can be true.
        const receipt = await waitForTransactionReceipt(config, { hash, pollingInterval: 200, timeout: 60_000 });
        const at = Date.now();
        dispatch({ type: 'receipt', status: receipt.status, block: receipt.blockNumber, at });
        if (receipt.status === 'success') {
          await queryClient.invalidateQueries();
          onConfirmed.current?.({ hash, block: receipt.blockNumber, seconds: elapsedSeconds(sentAt, at) });
        }
      } catch (err) {
        dispatch({ type: 'error', err });
      } finally {
        busy.current = false;
      }
    },
    [config, queryClient],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  return { state, run, reset };
}
