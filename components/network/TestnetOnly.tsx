'use client';

import { useNetwork } from './NetworkProvider';

/** Gate for testnet-only features (spec §8.2): Launch and demo controls are hidden on mainnet. */
export function TestnetOnly({ feature, name, children }: { feature: 'launch' | 'demoControls'; name: string; children: React.ReactNode }) {
  const { config, setNetwork } = useNetwork();
  if (config.features[feature]) return <>{children}</>;
  return (
    <div className="mx-auto max-w-[520px] rounded-2xl border border-hairline bg-paper px-6 py-8 text-center">
      <h1 className="text-[18px] font-semibold">{name} runs on Monad Testnet only</h1>
      <p className="mt-2 text-[13px] text-secondary">It uses test tokens, so it is turned off on mainnet.</p>
      <button type="button" onClick={() => setNetwork('testnet')} className="mt-4 border-b border-ink pb-0.5 text-[13px] font-medium">
        Switch to Testnet
      </button>
    </div>
  );
}
