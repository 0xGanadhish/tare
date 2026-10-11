'use client';

import { formatUnits } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';
import { abis } from '@/shared/contracts';
import type { Network } from '@/shared/networks';
import type { PositionV2 } from '@/lib/positions';
import { TxButton } from '@/components/tx/TxButton';
import { shortHash, txUrl } from '@/components/tx/explorer';
import { useNetwork } from '@/components/network/NetworkProvider';
import { AutopilotToggle } from './AutopilotToggle';

export function fmtUsdc(raw: bigint | string): string {
  try {
    return Number(formatUnits(BigInt(raw), 6)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  } catch {
    return '–';
  }
}

/** "Exit now": vault.redeem(shares, owner, owner) from the user's own wallet. Needs nothing from Tare. */
export function ExitButton({ position, label = 'Exit now' }: { position: PositionV2; label?: string }) {
  const { address } = useAccount();
  const { config } = useNetwork();
  const { writeContractAsync } = useWriteContract();
  return (
    <TxButton
      label={label}
      variant="secondary"
      disabled={!address || position.shares === 0n}
      run={() =>
        writeContractAsync({ chainId: config.chain.id, address: position.vault.address, abi: abis.erc4626, functionName: 'redeem', args: [position.shares, address!, address!] })
      }
    />
  );
}

const VERDICT_TONE: Record<string, string> = { HOLD: 'text-deposit', EXIT: 'text-avoid', MOVE: 'text-avoid' };
const PROTOCOL: Record<string, string> = { mirror: 'Testnet mirror', euler: 'Euler', morpho: 'Morpho' };

const ago = (unix: number) => {
  const s = Math.max(0, Math.round(Date.now() / 1000 - unix));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export function PositionCard({ position, network }: { position: PositionV2; network: Network }) {
  const { rule, latest } = position;
  const on = Boolean(rule?.enabled);
  return (
    <article className="rounded-[14px] bg-paper p-5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_20px_40px_-24px_rgba(32,0,82,0.25),0_4px_10px_-6px_rgba(32,0,82,0.15)]">
      <div className="mono flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted">
        <span>{PROTOCOL[position.vault.protocol] ?? position.vault.protocol}</span>
        <span className={on ? 'text-deposit' : ''}>{on ? '● Guardian on' : 'Guardian off'}</span>
      </div>
      <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">{position.vault.name}</h3>
      <p className="mono mt-2 text-[26px] tabular-nums tracking-tight">
        {fmtUsdc(position.assets)} <span className="text-[13px] text-muted">USDC</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t-[1.5px] border-dashed border-[#e2dfea] pt-4 text-[12px]">
        <Stat k="Jev says" v={latest ? latest.verdict : '–'} cls={latest ? VERDICT_TONE[latest.verdict] : ''} />
        <Stat k="Confidence" v={latest ? `${(latest.confidenceBps / 100).toFixed(0)}%` : '–'} />
        <Stat k="Exit rule" v={on && rule ? `≥${(rule.minConfidenceBps / 100).toFixed(0)}% · ${Math.round(rule.maxAge / 60)}m` : '–'} />
      </dl>
      {latest ? (
        <p className="mono mt-3 text-[11px] text-secondary">
          Posted onchain {ago(latest.postedAt)}
          {latest.txHash && (
            <>
              {' · '}
              <a href={txUrl(latest.txHash, network)} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4">
                {shortHash(latest.txHash)} ↗
              </a>
            </>
          )}
          {latest.stateUrl && (
            <>
              {' · '}
              <a href={latest.stateUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4">
                What Jev saw ↗
              </a>
            </>
          )}
        </p>
      ) : (
        <p className="mono mt-3 text-[11px] text-muted">No onchain verdict for this vault yet.</p>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4">
        <AutopilotToggle vault={position.vault.address} rule={rule} />
        <ExitButton position={position} />
      </div>
    </article>
  );
}

function Stat({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className={`mono mt-0.5 font-medium tabular-nums ${cls ?? ''}`}>{v}</dd>
    </div>
  );
}
