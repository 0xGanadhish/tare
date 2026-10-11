'use client';

import { useNetwork } from './NetworkProvider';

/** Persistent mainnet guardrail (spec §8.2). Renders nothing on testnet. */
export function RealFundsBanner() {
  const { network, config } = useNetwork();
  if (network !== 'mainnet') return null;
  const cap = config.features.softCapUsd;
  return (
    <div role="note" data-testid="real-funds-banner" className="border-b border-avoid/30 bg-avoid/10 text-[12px] text-ink">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 sm:px-9">
        <strong className="font-semibold">Real funds.</strong> You are on Monad Mainnet. Deposits use real USDC
        {cap != null && <> and are capped at ${cap.toLocaleString('en-US')} per wallet in this app</>}. Tare never holds your funds.
      </div>
    </div>
  );
}
