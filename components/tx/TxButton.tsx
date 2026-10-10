'use client';

import { injected, useAccount, useChainId, useConnect, useSwitchChain } from 'wagmi';
import { monadTestnet } from '@/shared/chains';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { TxStatus } from './TxStatus';
import type { Hash } from './txReducer';
import { useTx, type ConfirmedTx } from './useTx';

export interface TxButtonProps {
  label: string;
  /** Sends the transaction and returns its hash, e.g. `() => writeContractAsync({...})`. */
  run: () => Promise<Hash>;
  disabled?: boolean;
  onConfirmed?: (tx: ConfirmedTx) => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  /** Render the status as a floating card under the button (for tight headers). */
  popover?: boolean;
}

/**
 * Button + live transaction status. If the wallet is not connected or on the wrong network the
 * button first asks for that instead of sending (so pages never need their own connect gate).
 */
export function TxButton({ label, run, disabled, onConfirmed, variant, size, className, popover }: TxButtonProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { state, run: runTx } = useTx({ onConfirmed });

  const busy = state.status === 'awaiting_signature' || state.status === 'pending';
  const needsConnect = !isConnected;
  const needsSwitch = isConnected && chainId !== monadTestnet.id;

  const text = needsConnect
    ? 'Connect wallet'
    : needsSwitch
      ? 'Switch to Monad testnet'
      : state.status === 'awaiting_signature'
        ? 'Waiting for signature…'
        : state.status === 'pending'
          ? 'Pending…'
          : label;

  const onClick = () => {
    if (needsConnect) connect({ connector: injected() });
    else if (needsSwitch) switchChain({ chainId: monadTestnet.id });
    else void runTx(run);
  };

  return (
    <div className={`relative ${popover ? 'inline-block' : ''} ${className ?? ''}`}>
      <Button variant={variant} size={size} onClick={onClick} disabled={busy || (disabled && !needsConnect && !needsSwitch)} className={popover ? '' : 'w-full sm:w-auto'}>
        {text}
      </Button>
      {popover ? (
        state.status !== 'idle' && (
          <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-hairline bg-paper p-3 shadow-[0_12px_32px_-16px_rgba(32,0,82,0.3)]">
            <TxStatus state={state} />
          </div>
        )
      ) : (
        <TxStatus state={state} className="mt-2" />
      )}
    </div>
  );
}
