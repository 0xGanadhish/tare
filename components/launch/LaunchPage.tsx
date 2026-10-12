'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useWriteContract } from 'wagmi';
import { abis, addresses } from '@/shared/contracts';
import type { Address, Pool, Verdict } from '@/shared/types';
import { TxButton } from '@/components/tx/TxButton';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Deploying } from './Deploying';
import { TokenCard } from './TokenCard';

export function LaunchPage() {
  if (!addresses.launchFactory) return <Deploying />;
  return <Launch factory={addresses.launchFactory} />;
}

function Launch({ factory }: { factory: Address }) {
  const client = usePublicClient({ chainId: 10143 });
  const { writeContractAsync } = useWriteContract();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [selection, setSelection] = useState<Address | null>(null);
  const mirrors = addresses.mirrors ?? [];
  const pools = useQuery({
    queryKey: ['launch', 'pools'],
    queryFn: async () => {
      const response = await fetch('/api/pools');
      if (!response.ok) throw new Error('Pool judgments are unavailable');
      return await response.json() as { pools: Pool[]; verdicts: Record<string, Verdict> };
    },
    staleTime: 30_000,
  });
  const recommended = mirrors
    .map((mirror) => ({ mirror, verdict: mirror.poolId ? pools.data?.verdicts[mirror.poolId] : undefined }))
    .filter((entry) => entry.verdict?.label === 'DEPOSIT' && entry.verdict.source === 'jev')
    .sort((a, b) => (b.verdict?.confidence ?? 0) - (a.verdict?.confidence ?? 0))[0]?.mirror;
  const reserve = selection ?? recommended?.address ?? mirrors[0]?.address;
  const tokens = useQuery({
    queryKey: ['launch', 'tokens', factory],
    enabled: !!client && !!factory,
    queryFn: async () => {
      if (!client || !factory) throw new Error('Testnet connection unavailable');
      // The factory keeps its own registry, so one read lists every launch (newest first).
      const all = await client.readContract({ address: factory, abi: abis.launchFactory, functionName: 'launches' });
      return [...all].reverse();
    },
    refetchInterval: 10_000,
  });
  const valid = name.trim().length > 0 && symbol.trim().length > 0 && !!reserve;

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">Launch · Monad testnet</p>
      <h1 className="display mt-4 max-w-2xl text-4xl sm:text-6xl">A token with something underneath.</h1>
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-secondary">A linear bonding curve. A reserve earning yield. Create a token whose backing stays visible, onchain.</p>
      <div className="mt-12 grid gap-12 border-t border-hairline pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <section aria-labelledby="create-title">
          <h2 id="create-title" className="display text-2xl">Create a token</h2>
          <form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>
            <label className="block text-sm">Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your token name" required className="mt-2 block w-full rounded-lg border border-hairline bg-paper px-3 py-3 outline-none focus:border-deposit" />
            </label>
            <label className="block text-sm">Symbol
              <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="TICKER" required className="mono mt-2 block w-full rounded-lg border border-hairline bg-paper px-3 py-3 outline-none focus:border-deposit" />
            </label>
            <label className="block text-sm">Reserve vault
              <Select value={reserve ?? ''} onChange={(event) => setSelection(event.target.value as Address)} disabled={!mirrors.length} wrapperClassName="mt-2 block w-full min-w-0" className="block min-w-0 rounded-lg border border-hairline bg-paper py-3 pl-3 text-sm outline-none focus:border-deposit">
                {!mirrors.length && <option value="">Reserve vaults deploying</option>}
                {mirrors.map((mirror) => <option key={mirror.address} value={mirror.address}>{mirror.mirrorOf}{mirror.address === recommended?.address ? ' · Jev recommends' : ''}</option>)}
              </Select>
            </label>
            <p className="text-xs leading-relaxed text-secondary">Testnet mirror · {mirrors.find((mirror) => mirror.address === reserve)?.mirrorOf ?? 'No reserve available'}. Yield is simulated; wallet transactions are real.</p>
            {pools.isError && <p className="text-xs text-secondary">Jev recommendations are unavailable. Choose a reserve manually.</p>}
            {!pools.isPending && !pools.isError && !recommended && <p className="text-xs text-secondary">No Jev deposit recommendation for these reserves yet.</p>}
            <TxButton label="Create token" chainId={10143} disabled={!valid} run={() => {
              if (!reserve || !valid) throw new Error('Enter a name, symbol, and reserve vault');
              return writeContractAsync({ address: factory, abi: abis.launchFactory, functionName: 'create', args: [name.trim(), symbol.trim(), reserve], chainId: 10143 });
            }} />
          </form>
        </section>
        <section aria-labelledby="tokens-title" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tokens-title" className="display text-2xl">Launched tokens</h2>
            <span className="mono text-[10px] uppercase tracking-wider text-muted">Onchain registry</span>
          </div>
          {tokens.isPending && <p role="status" className="mt-6 text-sm text-secondary">Reading launched tokens…</p>}
          {tokens.isError && <div role="alert" className="mt-6 space-y-3 text-sm text-secondary"><p>Could not read launched tokens. No token list is being assumed.</p><p className="break-words text-xs">{tokens.error.message}</p><Button size="sm" variant="secondary" onClick={() => void tokens.refetch()}>Retry</Button></div>}
          {!tokens.isError && tokens.data?.length === 0 && <p className="mt-6 border-t border-hairline py-6 text-sm text-secondary">No tokens launched yet. The first reserve starts here.</p>}
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {tokens.data?.map((launch) => (
              <li key={launch.token}>
                <TokenCard
                  token={launch.token}
                  name={launch.name}
                  symbol={launch.symbol}
                  reserveLabel={`Testnet mirror · ${mirrors.find((mirror) => mirror.address.toLowerCase() === launch.reserveVault.toLowerCase())?.mirrorOf ?? launch.reserveVault}`}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
