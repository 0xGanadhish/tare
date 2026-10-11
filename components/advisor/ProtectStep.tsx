'use client';

import { useState } from 'react';
import { maxUint256, type Address } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { abis } from '@/shared/contracts';
import { UNDEPLOYED } from '@/shared/networks';
import { TxButton } from '@/components/tx/TxButton';
import { useNetwork } from '@/components/network/NetworkProvider';

export const FRESHNESS_MINUTES = [5, 10, 30, 60] as const;
export const MIN_CONFIDENCE_PCT = 80;
export const MAX_CONFIDENCE_PCT = 99;

/** Slider percent → `minConfidenceBps` (GuardianV2 accepts 8000..9900). */
export const confidenceBps = (pct: number): number => Math.round(Math.min(MAX_CONFIDENCE_PCT, Math.max(MIN_CONFIDENCE_PCT, pct)) * 100);

export interface ProtectStepProps {
  vault: Address;
  onDone(): void;
  /** Pre-fill from an existing rule (Watch "Edit rule"). */
  initial?: { minConfidenceBps: number; maxAge: number };
  /** The vault's latest onchain verdict is EXIT: enabling now resets the rule, so Guardian will not act on that verdict. */
  liveExit?: boolean;
}

/**
 * "Protect with Guardian" (spec §8.2): approve vault shares to GuardianV2, then enable(vault, minConfidenceBps, maxAge).
 * Guardian can only ever redeem those shares back to the owner's wallet.
 */
export function ProtectStep({ vault, onDone, initial, liveExit }: ProtectStepProps) {
  const { address } = useAccount();
  const { config } = useNetwork();
  const { writeContractAsync } = useWriteContract();
  const [pct, setPct] = useState(initial ? Math.round(initial.minConfidenceBps / 100) : 90);
  const [minutes, setMinutes] = useState<number>(initial ? Math.round(initial.maxAge / 60) : 10);
  const guardian = config.guardian;
  const common = { chainId: config.chain.id } as const;
  const deployed = guardian !== UNDEPLOYED;

  const allowance = useReadContract({
    ...common, address: vault, abi: abis.erc4626, functionName: 'allowance',
    args: address ? [address, guardian] : undefined, query: { enabled: Boolean(deployed && address) },
  });
  const approvedVault = useReadContract({
    ...common, address: guardian, abi: abis.guardianV2, functionName: 'approvedVault', args: [vault], query: { enabled: deployed },
  });

  if (!deployed) {
    return <p className="text-[12.5px] text-secondary">Guardian is not deployed on this network yet.</p>;
  }
  if (approvedVault.data === false) {
    return <p className="text-[12.5px] text-secondary">Guardian does not cover this vault yet.</p>;
  }

  // Shares grow with deposits, so approve the maximum once; Guardian still redeems only to the owner.
  const sharesApproved = (allowance.data ?? 0n) > 0n;
  const bps = confidenceBps(pct);

  return (
    <div>
      <div className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Protect with Guardian (optional)</div>
      <p className="mt-1 text-[12.5px] leading-snug text-secondary">
        If Jev posts an EXIT verdict for this vault onchain, anyone can trigger Guardian to send your funds back to your wallet. Nothing else can move them.
      </p>
      {liveExit && (
        <p role="note" className="mt-2 rounded-lg border border-avoid/40 bg-avoid/5 p-2.5 text-[12px] leading-snug text-ink">
          Jev&apos;s current EXIT verdict for this vault was posted before this change, so Guardian will not act on it; it waits for a newer
          EXIT. To leave now, use Exit now.
        </p>
      )}
      <label htmlFor={`conf-${vault}`} className="mt-3 flex justify-between text-[11.5px] text-secondary">
        <span>Exit when Jev is at least</span>
        <span className="mono text-ink">{pct}% sure</span>
      </label>
      <input
        id={`conf-${vault}`}
        type="range"
        min={MIN_CONFIDENCE_PCT}
        max={MAX_CONFIDENCE_PCT}
        step={1}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--deposit)]"
      />
      <label htmlFor={`fresh-${vault}`} className="mt-3 block text-[11.5px] text-secondary">
        Only act on verdicts newer than
      </label>
      <select
        id={`fresh-${vault}`}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        className="mono mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13px]"
      >
        {FRESHNESS_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
      <div className="mt-3 space-y-3">
        <TxButton
          label="1 · Approve shares to Guardian"
          variant="secondary"
          disabled={sharesApproved || !address}
          run={() => writeContractAsync({ ...common, address: vault, abi: abis.erc4626, functionName: 'approve', args: [guardian, maxUint256] })}
        />
        <TxButton
          label="2 · Turn on Guardian"
          disabled={!sharesApproved || !address}
          onConfirmed={onDone}
          run={() => writeContractAsync({ ...common, address: guardian, abi: abis.guardianV2, functionName: 'enable', args: [vault, bps, minutes * 60] })}
        />
      </div>
    </div>
  );
}
