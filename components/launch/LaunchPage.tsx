'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useWriteContract } from 'wagmi';
import { abis, addresses } from '@/shared/contracts';
import type { Address, Pool, Verdict } from '@/shared/types';
import { TxButton } from '@/components/tx/TxButton';
import { Button } from '@/components/ui/Button';
import { Deploying } from './Deploying';

interface LaunchLog {
  args: { token: Address; name: string; symbol: string; reserveVault: Address };
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  blockNumber: bigint | null;
}

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
  const registry = useRef<{ deployment: bigint; through: bigint; logs: LaunchLog[] } | null>(null);
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
    enabled: !!client,
    queryFn: async () => {
      if (!client) throw new Error('Testnet connection unavailable');
      // The public testnet RPC allows only 100-block log ranges and cannot
      // answer ancient eth_getCode calls. Record this block when deploying.
      const configuredBlock = process.env.NEXT_PUBLIC_LAUNCH_DEPLOYMENT_BLOCK;
      if (!configuredBlock || !/^\d+$/.test(configuredBlock)) {
        throw new Error('Launch registry needs NEXT_PUBLIC_LAUNCH_DEPLOYMENT_BLOCK from the factory deployment receipt.');
      }
      const deployment = BigInt(configuredBlock);
      const latest = await client.getBlockNumber({ cacheTime: 0 });
      if (deployment > latest) throw new Error('The launch deployment block is ahead of Monad testnet.');
      // Re-read the recent suffix so late execution results and recent reorgs
      // cannot leave a permanently missing or orphaned token in the registry.
      const overlap = registry.current ? registry.current.through - 99n : deployment;
      const from = overlap > deployment ? overlap : deployment;
      const logs = registry.current?.logs.filter((log) => log.blockNumber !== null && log.blockNumber < from) ?? [];
      for (let start = from; start <= latest; start += 100n) {
        const end = start + 99n < latest ? start + 99n : latest;
        const batch = await client.getContractEvents({
          address: factory, abi: abis.launchFactory, eventName: 'TokenCreated',
          fromBlock: start, toBlock: end, strict: true,
        });
        logs.push(...batch.filter((log) => !log.removed));
      }
      registry.current = { deployment, through: latest, logs };
      return logs;
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
              <select value={reserve ?? ''} onChange={(event) => setSelection(event.target.value as Address)} disabled={!mirrors.length} className="mt-2 block w-full min-w-0 rounded-lg border border-hairline bg-paper px-3 py-3 text-sm outline-none focus:border-deposit">
                {!mirrors.length && <option value="">Reserve vaults deploying</option>}
                {mirrors.map((mirror) => <option key={mirror.address} value={mirror.address}>{mirror.mirrorOf}{mirror.address === recommended?.address ? ' · Jev recommends' : ''}</option>)}
              </select>
            </label>
            <p className="text-xs leading-relaxed text-secondary">Testnet mirror · {mirrors.find((mirror) => mirror.address === reserve)?.mirrorOf ?? 'No reserve available'}. Yield is simulated; wallet transactions are real.</p>
            {pools.isError && <p className="text-xs text-secondary">Jev recommendations are unavailable. Choose a reserve manually.</p>}
            {!pools.isPending && !pools.isError && !recommended && <p className="text-xs text-secondary">No Jev deposit recommendation for these reserves yet.</p>}
            <TxButton label="Create token" disabled={!valid} run={() => {
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
          {tokens.isPending && <p role="status" className="mt-6 text-sm text-secondary">Reading launch events…</p>}
          {tokens.isError && <div role="alert" className="mt-6 space-y-3 text-sm text-secondary"><p>Could not read launch events. No token list is being assumed.</p><p className="break-words text-xs">{tokens.error.message}</p><Button size="sm" variant="secondary" onClick={() => void tokens.refetch()}>Retry</Button></div>}
          {!tokens.isError && tokens.data?.length === 0 && <p className="mt-6 border-t border-hairline py-6 text-sm text-secondary">No tokens launched yet. The first reserve starts here.</p>}
          <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
            {tokens.data?.map((log) => <li key={`${log.transactionHash}-${log.logIndex}`}>
              <Link href={`/app/launch/${log.args.token}`} className="group block py-5">
                <div className="flex justify-between gap-4"><span className="break-words text-lg font-medium">{log.args.name}</span><span className="mono text-sm text-secondary">{log.args.symbol} ↗</span></div>
                <p className="mono mt-2 break-all text-[10px] text-muted">{log.args.token}</p>
                <p className="mt-2 text-xs text-secondary">Testnet mirror · {mirrors.find((mirror) => mirror.address.toLowerCase() === log.args.reserveVault.toLowerCase())?.mirrorOf ?? log.args.reserveVault}</p>
              </Link>
            </li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
