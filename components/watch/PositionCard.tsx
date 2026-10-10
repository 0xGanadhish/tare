'use client';

import { formatUnits } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';
import { monadTestnet } from '@/shared/chains';
import { abis } from '@/shared/contracts';
import { TxButton } from '@/components/tx/TxButton';
import type { Position } from '@/shared/types';
import { AutopilotToggle } from './AutopilotToggle';

export function fmtUsdc(raw: string): string {
  try {
    return Number(formatUnits(BigInt(raw), 6)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  } catch {
    return '–';
  }
}

export function ExitButton({ position, label = 'Exit now' }: { position: Position; label?: string }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  return (
    <TxButton
      label={label}
      variant="secondary"
      disabled={!address || position.shares === '0'}
      run={() =>
        writeContractAsync({ chainId: monadTestnet.id, address: position.vault, abi: abis.mirrorVault, functionName: 'redeem', args: [BigInt(position.shares), address!, address!] })
      }
    />
  );
}

const ACTION_TONE: Record<string, string> = { hold: 'text-deposit', exit: 'text-avoid', rotate: 'text-avoid' };

export function PositionCard({ position }: { position: Position }) {
  const j = position.judgment;
  return (
    <article className="rounded-[14px] bg-paper p-5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_20px_40px_-24px_rgba(32,0,82,0.25),0_4px_10px_-6px_rgba(32,0,82,0.15)]">
      <div className="mono flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted">
        <span>Testnet mirror</span>
        <span className={position.autopilot ? 'text-deposit' : ''}>{position.autopilot ? '● Autopilot on' : 'Autopilot off'}</span>
      </div>
      <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">{position.mirrorOf}</h3>
      <p className="mono mt-2 text-[26px] tabular-nums tracking-tight">{fmtUsdc(position.assets)} <span className="text-[13px] text-muted">USDC</span></p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t-[1.5px] border-dashed border-[#e2dfea] pt-4 text-[12px]">
        <Stat k="Vault APY" v={`${(position.apyBps / 100).toFixed(2)}%`} />
        <Stat k="Utilization" v={`${(position.utilBps / 100).toFixed(1)}%`} warn={position.utilBps >= 9000} />
        <Stat k="Jev says" v={j ? j.action.value : '–'} cls={j ? ACTION_TONE[j.action.value] : ''} />
      </dl>
      {j ? (
        <p className="mono mt-3 text-[11px] text-secondary">
          Jev · {j.action.value} ({j.action.confidence.toFixed(2)}) · withdrawal risk {j.withdrawalRisk.toFixed(2)} · yield collapse {j.yieldCollapse.toFixed(2)}
        </p>
      ) : (
        <p className="mono mt-3 text-[11px] text-muted">No judgment yet. The watchdog judges when vault stats change.</p>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4">
        <AutopilotToggle vault={position.vault} enabled={position.autopilot} />
        <ExitButton position={position} label="Withdraw everything" />
      </div>
    </article>
  );
}

function Stat({ k, v, warn, cls }: { k: string; v: string; warn?: boolean; cls?: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className={`mono mt-0.5 font-medium capitalize tabular-nums ${warn ? 'text-avoid' : ''} ${cls ?? ''}`}>{v}</dd>
    </div>
  );
}
