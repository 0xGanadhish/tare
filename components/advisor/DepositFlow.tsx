'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { abis } from '@/shared/contracts';
import { UNDEPLOYED, type VaultConfig } from '@/shared/networks';
import { TxButton } from '@/components/tx/TxButton';
import { Button } from '@/components/ui/Button';
import { validateAmount, type AmountResult } from '@/components/tx/validateAmount';
import { networkLabel, useNetwork } from '@/components/network/NetworkProvider';
import { useDepositedUsd } from './useDepositedUsd';
import { ProtectStep } from './ProtectStep';

const DECIMALS = 6;
const ACK_KEY = 'tare.mainnet-ack';

export interface DepositFlowProps {
  vault: VaultConfig;
  defaultAmount?: number | null;
}

const vaultLabel = (network: string, vault: VaultConfig) =>
  vault.protocol === 'mirror' ? `Testnet mirror · ${vault.name}` : `${network === 'mainnet' ? 'Mainnet' : 'Testnet'} · ${vault.name}`;

function readAck(owner: string | undefined): boolean {
  if (!owner) return false;
  try {
    return window.localStorage.getItem(`${ACK_KEY}.${owner.toLowerCase()}`) === '1';
  } catch {
    return false;
  }
}

/**
 * approve → deposit → optional Protect (spec §8.2) on the selected network.
 * Every step is disabled while the wallet is on the other chain; mainnet asks for a one-time real-funds confirmation
 * and enforces the per-wallet soft cap.
 */
export function DepositFlow({ vault, defaultAmount }: DepositFlowProps) {
  const { address } = useAccount();
  const { network, config, walletOnRightChain, switchWalletChain } = useNetwork();
  const { writeContractAsync } = useWriteContract();
  const token = config.usdc;
  const [text, setText] = useState(defaultAmount ? String(defaultAmount) : '');
  const [acked, setAcked] = useState(false);
  const [deposited, setDeposited] = useState(false);
  const deposits = useDepositedUsd(config, address);

  useEffect(() => setAcked(readAck(address)), [address]);

  const common = { chainId: config.chain.id } as const;
  const tokenReady = token !== UNDEPLOYED;
  const balance = useReadContract({
    ...common, address: token, abi: abis.mockToken, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: Boolean(tokenReady && address) },
  });
  const allowance = useReadContract({
    ...common, address: token, abi: abis.mockToken, functionName: 'allowance',
    args: address ? [address, vault.address] : undefined, query: { enabled: Boolean(tokenReady && address) },
  });

  const label = vaultLabel(network, vault);
  if (!tokenReady) {
    return (
      <div>
        <p className="mono text-[11px] text-muted">{label}</p>
        <p className="mt-2 text-[12.5px] text-secondary">Deposits are not available yet: no USDC address is configured for this network.</p>
      </div>
    );
  }

  const needsAck = network === 'mainnet' && !acked;
  if (needsAck) {
    return (
      <div>
        <p className="mono text-[11px] text-muted">{label}</p>
        <div role="alertdialog" aria-label="Real funds" className="mt-3 rounded-lg border border-avoid/40 bg-avoid/5 p-3 text-[12.5px] leading-snug text-ink">
          <p>
            This deposit uses real USDC on Monad Mainnet. The vault is run by {vault.protocol === 'euler' ? 'Euler' : vault.protocol === 'morpho' ? 'Morpho' : 'its protocol'}, not Tare,
            and can lose value or lock withdrawals. Jev&rsquo;s verdicts are forecasts, not guarantees. Tare never holds your funds.
          </p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              try {
                if (address) window.localStorage.setItem(`${ACK_KEY}.${address.toLowerCase()}`, '1');
              } catch {
                // Storage blocked: ask again next time.
              }
              setAcked(true);
            }}
          >
            I understand, continue
          </Button>
        </div>
      </div>
    );
  }

  const bal = balance.data ?? 0n;
  const capUsd = config.features.softCapUsd;
  const amount: AmountResult = capUsd != null && deposits === null
    ? { ok: false, error: 'Checking your existing deposits…' }
    : validateAmount(text, bal, DECIMALS, capUsd == null ? undefined : { softCapUsd: capUsd, alreadyDepositedUsd: deposits ?? 0 });
  const approved = amount.ok && (allowance.data ?? 0n) >= amount.value;
  const showError = Boolean(address) && text.trim() !== '' && !amount.ok;
  const blocked = !walletOnRightChain;

  return (
    <div>
      <p className="mono text-[11px] text-muted">{label}</p>
      {blocked && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-secondary">
          <span>Your wallet is on another network.</span>
          <Button size="sm" variant="purple" onClick={() => void switchWalletChain().catch(() => {})}>
            Switch to {networkLabel(network)}
          </Button>
        </div>
      )}
      <label htmlFor={`amt-${vault.address}`} className="mt-3 block text-[11px] text-secondary">
        Amount ({network === 'mainnet' ? 'USDC' : 'test USDC'})
        {address && balance.data !== undefined && (
          <span className="mono text-muted"> · balance {Number(formatUnits(bal, DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        )}
      </label>
      <input
        id={`amt-${vault.address}`}
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
          {amount.error === 'Insufficient balance' && config.features.faucet && ' — use “Get test USDC” in the header'}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <TxButton
          blocked={blocked}
          label="1 · Approve"
          variant="secondary"
          disabled={!amount.ok || approved}
          run={() => writeContractAsync({ ...common, address: token, abi: abis.mockToken, functionName: 'approve', args: [vault.address, amount.ok ? amount.value : 0n] })}
        />
        {approved && !showError && <p className="mono text-[11px] text-secondary">Approved on-chain.</p>}
        <TxButton
          blocked={blocked}
          label="2 · Deposit"
          disabled={!amount.ok || !approved || !address}
          onConfirmed={() => setDeposited(true)}
          run={() => writeContractAsync({ ...common, address: vault.address, abi: abis.erc4626, functionName: 'deposit', args: [amount.ok ? amount.value : 0n, address!] })}
        />
      </div>
      {deposited && !blocked && (
        <div className="mt-4 border-t border-hairline pt-4">
          <ProtectStep vault={vault.address} onDone={() => {}} />
        </div>
      )}
    </div>
  );
}

