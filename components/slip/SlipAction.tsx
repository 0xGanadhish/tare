'use client';

import type { Pool } from '@/shared/types';
import { DepositFlow } from '@/components/advisor/DepositFlow';
import { useNetwork } from '@/components/network/NetworkProvider';
import { slipAction } from './slipActionKind';

/**
 * The slip's action slot: Deposit into the pool's vault on this network, else a quiet note (the slip already links to the protocol).
 * `note={false}` drops the note where the caller shows it elsewhere, as the Advisor does in its Details list.
 */
export function SlipAction({ pool, defaultAmount, note = true }: { pool: Pool; defaultAmount?: number | null; note?: boolean }) {
  const { network } = useNetwork();
  const action = slipAction(network, pool.id);
  // Keyed by network and vault so step state (approved, deposited) never carries across a switch.
  if (action.kind === 'deposit') return <DepositFlow key={`${network}:${action.vault.address}`} vault={action.vault} defaultAmount={defaultAmount} />;
  if (!note) return null;
  return <p className="text-[11.5px] text-muted">No Tare vault for this pool on {network === 'mainnet' ? 'mainnet' : 'testnet'}, so there is nothing to deposit here.</p>;
}
