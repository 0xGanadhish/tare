'use client';

import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { maxUint256 } from 'viem';
import { monadTestnet } from '@/shared/chains';
import { abis, addresses } from '@/shared/contracts';
import { TxButton } from '@/components/tx/TxButton';

/** ON = share `approve(guardian, max)` then `Guardian.enable(vault)`; OFF = `disable(vault)`. All user-signed. */
export function AutopilotToggle({ vault, enabled }: { vault: `0x${string}`; enabled: boolean }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const guardian = addresses.guardian;
  const allowance = useReadContract({
    address: vault,
    abi: abis.mirrorVault,
    functionName: 'allowance',
    args: address && guardian ? [address, guardian] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(address && guardian) },
  });
  if (!guardian) return <p className="mono text-[11.5px] text-muted">Autopilot is unavailable: Guardian is not deployed.</p>;

  const common = { chainId: monadTestnet.id } as const;
  if (enabled) {
    return (
      <TxButton
        label="Turn autopilot off"
        variant="secondary"
        run={() => writeContractAsync({ ...common, address: guardian, abi: abis.guardian, functionName: 'disable', args: [vault] })}
      />
    );
  }
  const approved = (allowance.data ?? 0n) >= maxUint256 / 2n;
  return (
    <div className="space-y-3">
      <TxButton
        label="1 · Allow Guardian to exit"
        variant="secondary"
        disabled={approved}
        run={() => writeContractAsync({ ...common, address: vault, abi: abis.mirrorVault, functionName: 'approve', args: [guardian, maxUint256] })}
      />
      <TxButton
        label="2 · Turn autopilot on"
        disabled={!approved}
        run={() => writeContractAsync({ ...common, address: guardian, abi: abis.guardian, functionName: 'enable', args: [vault] })}
      />
    </div>
  );
}
