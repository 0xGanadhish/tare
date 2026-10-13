'use client';

import { NETWORK_IDS, type Network } from '@/shared/networks';
import { useNetwork } from './NetworkProvider';

const LABEL: Record<Network, string> = { testnet: 'Testnet', mainnet: 'Mainnet' };

/** Two-segment Testnet | Mainnet control for the header. */
export function NetworkSwitch() {
  const { network, setNetwork } = useNetwork();
  return (
    <div role="radiogroup" aria-label="Network" className="mono flex rounded-full border border-hairline p-0.5 text-[10.5px] uppercase tracking-[0.06em]">
      {NETWORK_IDS.map((n) => {
        const active = n === network;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setNetwork(n)}
            className={`rounded-full px-2.5 py-1 transition-colors ${active ? (n === 'mainnet' ? 'bg-avoid text-white' : 'bg-ink text-white') : 'text-secondary hover:text-ink'}`}
          >
            {LABEL[n]}
          </button>
        );
      })}
    </div>
  );
}
