'use client';

import type { Pool } from '@/shared/types';
import { protocolUrl } from '@/shared/protocols';
import { formatProject } from '@/components/field/format';
import { DepositFlow } from '@/components/advisor/DepositFlow';
import { useNetwork } from '@/components/network/NetworkProvider';
import { slipAction } from './slipAction';

/** The slip's action slot: Deposit into the pool's vault on this network, else a link to the protocol. */
export function SlipAction({ pool, defaultAmount }: { pool: Pool; defaultAmount?: number | null }) {
  const { network } = useNetwork();
  const action = slipAction(network, pool.id);
  // Keyed by network and vault so step state (approved, deposited) never carries across a switch.
  if (action.kind === 'deposit') return <DepositFlow key={`${network}:${action.vault.address}`} vault={action.vault} defaultAmount={defaultAmount} />;
  const url = protocolUrl(pool.project);
  return (
    <div>
      <p className="mono text-[11.5px] text-muted">No Tare vault for this pool on {network === 'mainnet' ? 'mainnet' : 'testnet'}.</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block border-b border-ink pb-0.5 text-[13px] font-medium">
          Open on protocol · {formatProject(pool.project)} ↗
        </a>
      )}
    </div>
  );
}
