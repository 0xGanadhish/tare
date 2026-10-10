'use client';

import { useEffect, useRef, useState } from 'react';
import { injected, useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { monadTestnet } from '@/shared/chains';
import { Button } from './Button';
import { shortHash } from '@/components/tx/explorer';

/** Injected-wallet connect + "switch to Monad testnet" prompt. */
export function WalletButton() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { connect, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [noWallet, setNoWallet] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!isConnected || !address) {
    return (
      <div className="relative">
        <Button
          size="sm"
          disabled={isConnecting}
          onClick={() => {
            if (typeof window !== 'undefined' && !(window as unknown as { ethereum?: unknown }).ethereum) {
              setNoWallet(true);
              return;
            }
            setNoWallet(false);
            connect({ connector: injected() });
          }}
        >
          {isConnecting ? 'Connecting…' : 'Connect wallet'}
        </Button>
        {(noWallet || connectError) && (
          <div role="alert" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-hairline bg-paper p-3 text-[12px] leading-snug text-secondary shadow-[0_12px_32px_-16px_rgba(32,0,82,0.3)]">
            {noWallet ? 'No browser wallet found. Install MetaMask or Rabby and reload.' : 'Could not connect. Approve the request in your wallet and try again.'}
          </div>
        )}
      </div>
    );
  }

  if (chainId !== monadTestnet.id) {
    return (
      <Button size="sm" variant="purple" disabled={switching} onClick={() => switchChain({ chainId: monadTestnet.id })}>
        {switching ? 'Switching…' : 'Switch to Monad testnet'}
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="size-1.5 rounded-full bg-deposit" aria-hidden />
        <span className="mono">{shortHash(address, 6, 4)}</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-hairline bg-paper p-1.5 shadow-[0_12px_32px_-16px_rgba(32,0,82,0.3)]">
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-[12.5px] text-secondary hover:bg-bg hover:text-ink"
            onClick={() => {
              navigator.clipboard?.writeText(address).catch(() => {});
              setOpen(false);
            }}
          >
            Copy address
          </button>
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-[12.5px] text-secondary hover:bg-bg hover:text-ink"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
