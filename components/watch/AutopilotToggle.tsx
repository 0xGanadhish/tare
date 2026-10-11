'use client';

import { useState } from 'react';
import { useWriteContract } from 'wagmi';
import { abis } from '@/shared/contracts';
import { UNDEPLOYED } from '@/shared/networks';
import type { PositionV2 } from '@/lib/positions';
import { TxButton } from '@/components/tx/TxButton';
import { Button } from '@/components/ui/Button';
import { ProtectStep } from '@/components/advisor/ProtectStep';
import { useNetwork } from '@/components/network/NetworkProvider';

/** Guardian rule controls: ON opens ProtectStep (approve shares + enable rule); OFF calls GuardianV2.disable. All user-signed. */
export function AutopilotToggle({ vault, rule }: { vault: `0x${string}`; rule: PositionV2['rule'] }) {
  const { config } = useNetwork();
  const { writeContractAsync } = useWriteContract();
  const [editing, setEditing] = useState(false);
  if (config.guardian === UNDEPLOYED) return <p className="mono text-[11.5px] text-muted">Guardian is not deployed on this network yet.</p>;

  if (editing) {
    return (
      <div>
        <ProtectStep vault={vault} initial={rule?.enabled ? rule : undefined} onDone={() => setEditing(false)} />
        <button type="button" onClick={() => setEditing(false)} className="mono mt-2 text-[11px] text-muted underline underline-offset-4">
          Cancel
        </button>
      </div>
    );
  }
  if (rule?.enabled) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit rule
        </Button>
        <TxButton
          label="Turn Guardian off"
          variant="secondary"
          size="sm"
          run={() => writeContractAsync({ chainId: config.chain.id, address: config.guardian, abi: abis.guardianV2, functionName: 'disable', args: [vault] })}
        />
      </div>
    );
  }
  return (
    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
      Protect with Guardian
    </Button>
  );
}
