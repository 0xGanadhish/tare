'use client';

import Link from 'next/link';
import { formatUnits, type Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { abis } from '@/shared/contracts';
import { monadTestnet } from '@/shared/chains';

const QUOTE_DECIMALS = 6; // reserve vaults hold MockUSDC

interface TokenCardProps {
  token: Address;
  name: string;
  symbol: string;
  reserveLabel: string;
}

const usd = (v: bigint | undefined, digits: number) =>
  v === undefined ? '—' : Number(formatUnits(v, QUOTE_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** One launched token as a card: live spot price, floor and reserve, refreshed every 5 s. */
export function TokenCard({ token, name, symbol, reserveLabel }: TokenCardProps) {
  const { data } = useReadContracts({
    contracts: [
      { address: token, abi: abis.curveToken, functionName: 'price', chainId: monadTestnet.id },
      { address: token, abi: abis.curveToken, functionName: 'floorPrice', chainId: monadTestnet.id },
      { address: token, abi: abis.curveToken, functionName: 'reserveAssets', chainId: monadTestnet.id },
    ],
    query: { refetchInterval: 5_000 },
  });
  const [price, floor, reserve] = (data ?? []).map((r) => (r?.status === 'success' ? (r.result as bigint) : undefined));
  const backed = price && floor !== undefined && price > 0n ? Number((floor * 1000n) / price) / 10 : null;

  return (
    <Link
      href={`/app/launch/${token}`}
      className="group flex h-full flex-col rounded-[14px] border border-hairline bg-paper p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_40px_-24px_rgba(32,0,82,0.28)] focus-visible:outline-2 focus-visible:outline-deposit"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-medium leading-tight">{name}</p>
          <p className="mono mt-1 text-[11px] uppercase tracking-wider text-muted">{symbol}</p>
        </div>
        <span aria-hidden className="text-muted transition-colors group-hover:text-ink">↗</span>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
        <div>
          <dt className="text-[10.5px] uppercase tracking-wider text-muted">Price</dt>
          <dd className="mono mt-1 text-[13px]">{usd(price, 6)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] uppercase tracking-wider text-muted">Floor</dt>
          <dd className="mono mt-1 text-[13px] text-deposit">{usd(floor, 6)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] uppercase tracking-wider text-muted">Reserve</dt>
          <dd className="mono mt-1 text-[13px]">{usd(reserve, 2)}</dd>
        </div>
      </dl>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-hairline" aria-hidden>
        <div className="h-full rounded-full bg-deposit transition-[width] duration-700" style={{ width: `${Math.min(backed ?? 0, 100)}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-secondary">
        {backed === null ? 'No supply yet · floor starts at first buy' : `${backed.toFixed(1)}% of price backed by the reserve`}
      </p>

      <p className="mt-auto pt-4 text-xs text-secondary">Reserve · {reserveLabel}</p>
      <p className="mono mt-1 truncate text-[10px] text-muted">{token}</p>
    </Link>
  );
}
