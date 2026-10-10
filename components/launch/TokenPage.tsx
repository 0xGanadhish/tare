'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, isAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { abis, addresses } from '@/shared/contracts';
import type { Address } from '@/shared/types';
import { Button } from '@/components/ui/Button';
import { Deploying } from './Deploying';
import { FloorChart } from './FloorChart';
import { TradeForm } from './TradeForm';

export function TokenPage({ token }: { token: string }) {
  if (!addresses.launchFactory) return <Deploying />;
  if (!isAddress(token)) return (
    <main className="mx-auto max-w-5xl px-5 py-16"><h1 className="display text-3xl">Not a valid token address</h1><Link href="/app/launch" className="mt-6 inline-block text-sm underline">Back to Launch</Link></main>
  );
  return <Token key={token} token={token} />;
}

function Token({ token }: { token: Address }) {
  const client = usePublicClient({ chainId: 10143 });
  const info = useQuery({
    queryKey: ['launch', 'token', token],
    enabled: !!client,
    queryFn: async () => {
      if (!client) throw new Error('Testnet connection unavailable');
      const [name, symbol, vault, asset, reserve, floor, price, supply] = await client.multicall({
        allowFailure: false,
        contracts: [
          { address: token, abi: abis.curveToken, functionName: 'name' },
          { address: token, abi: abis.curveToken, functionName: 'symbol' },
          { address: token, abi: abis.curveToken, functionName: 'reserveVault' },
          { address: token, abi: abis.curveToken, functionName: 'quoteAsset' },
          { address: token, abi: abis.curveToken, functionName: 'reserveAssets' },
          { address: token, abi: abis.curveToken, functionName: 'floorPrice' },
          { address: token, abi: abis.curveToken, functionName: 'price' },
          { address: token, abi: abis.curveToken, functionName: 'totalSupply' },
        ],
      });
      return { name, symbol, vault, asset, reserve, floor, price, supply };
    },
    refetchInterval: 2_000,
  });
  const asset = info.data?.asset;
  const quote = useQuery({
    queryKey: ['launch', 'asset', asset],
    enabled: !!client && !!asset,
    queryFn: async () => {
      if (!client || !asset) throw new Error('Quote asset unavailable');
      const [decimals, symbol] = await client.multicall({ allowFailure: false, contracts: [
        { address: asset, abi: abis.mockToken, functionName: 'decimals' },
        { address: asset, abi: abis.mockToken, functionName: 'symbol' },
      ] });
      return { decimals, symbol };
    },
    staleTime: Infinity,
  });
  const data = info.data;
  const currency = quote.data;
  const mirror = addresses.mirrors?.find((entry) => entry.address.toLowerCase() === data?.vault.toLowerCase());
  // floorPrice() truncates to quote-asset decimals. Preserve six extra digits
  // of the same backing/supply ratio so small, real reserve accrual is visible.
  const preciseFloor = data && data.supply > 0n ? data.reserve * 10n ** 24n / data.supply : 0n;
  const [floorWhole, floorFraction = ''] = currency ? formatUnits(preciseFloor, currency.decimals + 6).split('.') : ['0'];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/app/launch" className="mono text-[11px] text-secondary hover:text-ink">← All launches</Link>
      {info.isPending && <p role="status" className="mt-10 text-sm text-secondary">Reading token reserves…</p>}
      {(info.isError || quote.isError) && <div role="alert" className="mt-10 space-y-4"><h1 className="display text-3xl">Token data unavailable</h1><p className="text-sm text-secondary">The testnet contract could not be read. Trading is paused until its data is available.</p><Button variant="secondary" onClick={() => { void info.refetch(); void quote.refetch(); }}>Retry</Button></div>}
      {data && currency && <>
        <div className="mt-8 flex flex-wrap items-baseline gap-4"><h1 className="display break-words text-4xl sm:text-5xl">{data.name}</h1><span className="mono text-sm text-secondary">{data.symbol}</span></div>
        <p className="mono mt-3 break-all text-[11px] text-muted">{token}</p>
        <p className="mt-5 text-sm text-secondary">Testnet mirror · {mirror?.mirrorOf ?? data.vault}. Simulated yield, real onchain reserve.</p>
        {info.isError && <p role="alert" className="mt-4 text-sm text-avoid">Live reads failed. Values below are the last observed state; trading is paused.</p>}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <section className="min-w-0" aria-label="Live reserve metrics">
            <dl className="grid gap-y-6 border-t border-hairline pt-6 sm:grid-cols-3 sm:gap-x-5">
              <div><dt className="text-xs text-secondary">Reserve assets</dt><dd className="mono mt-2 break-all text-lg">{formatUnits(data.reserve, currency.decimals)} <span className="text-xs text-muted">{currency.symbol}</span></dd></div>
              <div><dt className="text-xs text-secondary">Floor / token</dt><dd className="mono mt-2 break-all text-lg">{floorWhole}.{floorFraction.padEnd(currency.decimals + 6, '0')} <span className="text-xs text-muted">{currency.symbol}</span></dd><dd className="mono mt-2 text-[10px] text-muted">Contract rounded: {formatUnits(data.floor, currency.decimals)}</dd></div>
              <div><dt className="text-xs text-secondary">Curve price / token</dt><dd className="mono mt-2 break-all text-lg">{formatUnits(data.price, currency.decimals)} <span className="text-xs text-muted">{currency.symbol}</span></dd></div>
            </dl>
            <FloorChart floor={preciseFloor} price={data.price * 10n ** 6n} updatedAt={info.dataUpdatedAt} decimals={currency.decimals + 6} symbol={currency.symbol} />
            <p className="mono mt-5 break-all text-[11px] text-muted">Supply {formatUnits(data.supply, 18)} {data.symbol} · reads every 2s</p>
          </section>
          <TradeForm token={token} asset={data.asset} quoteDecimals={currency.decimals} quoteSymbol={currency.symbol} tokenSymbol={data.symbol} paused={info.isError || quote.isError} />
        </div>
      </>}
      {data && quote.isPending && <p role="status" className="mt-6 text-sm text-secondary">Reading reserve currency…</p>}
    </main>
  );
}
