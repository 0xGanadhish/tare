'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { monadTestnet } from '@/shared/chains';
import { abis, addresses } from '@/shared/contracts';
import { TxButton } from '@/components/tx/TxButton';
import { validateAmount } from '@/components/tx/validateAmount';

const DECIMALS = 6;

export interface DepositFlowProps {
  vault: `0x${string}`;
  mirrorOf: string;
  defaultAmount?: number | null;
}

/** approve → deposit into a testnet mirror vault. Deposit unlocks only once the chain shows the allowance. */
export function DepositFlow({ vault, mirrorOf, defaultAmount }: DepositFlowProps) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const token = addresses.mockUsdc;
  const [text, setText] = useState(defaultAmount ? String(defaultAmount) : '');

  const common = { chainId: monadTestnet.id } as const;
  const balance = useReadContract({
    ...common,
    address: token,
    abi: abis.mockToken,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(token && address) },
  });
  const allowance = useReadContract({
    ...common,
    address: token,
    abi: abis.mockToken,
    functionName: 'allowance',
    args: address ? [address, vault] : undefined,
    query: { enabled: Boolean(token && address) },
  });

  const label = `Testnet mirror · ${mirrorOf}`;
  if (!token) {
    return (
      <div>
        <p className="mono text-[11px] text-muted">{label}</p>
        <p className="mt-2 text-[12.5px] text-secondary">Testnet deposits are not available yet: no test USDC address is configured.</p>
      </div>
    );
  }

  const bal = balance.data ?? 0n;
  const amount = validateAmount(text, bal, DECIMALS);
  const approved = amount.ok && (allowance.data ?? 0n) >= amount.value;
  const showError = Boolean(address) && text.trim() !== '' && !amount.ok;

  return (
    <div>
      <p className="mono text-[11px] text-muted">{label}</p>
      <label htmlFor={`amt-${vault}`} className="mt-3 block text-[11px] text-secondary">
        Amount (test USDC){address && balance.data !== undefined && <span className="mono text-muted"> · balance {Number(formatUnits(bal, DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
      </label>
      <input
        id={`amt-${vault}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="500"
        aria-invalid={showError || undefined}
        className="mono mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40"
      />
      {showError && !amount.ok && (
        <p role="alert" className="mt-1 text-[11.5px] text-avoid">
          {amount.error}
          {amount.error === 'Insufficient balance' && ' — use “Get test USDC” in the header'}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <TxButton
          label="1 · Approve"
          variant="secondary"
          disabled={!amount.ok || approved}
          run={() => writeContractAsync({ ...common, address: token, abi: abis.mockToken, functionName: 'approve', args: [vault, amount.ok ? amount.value : 0n] })}
        />
        {approved && !showError && <p className="mono text-[11px] text-secondary">Approved on-chain.</p>}
        <TxButton
          label="2 · Deposit"
          disabled={!amount.ok || !approved || !address}
          run={() =>
            writeContractAsync({ ...common, address: vault, abi: abis.mirrorVault, functionName: 'deposit', args: [amount.ok ? amount.value : 0n, address!] })
          }
        />
      </div>
    </div>
  );
}
