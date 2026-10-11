'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { EventFeed } from '@/components/watch/EventFeed';
import { PositionCard } from '@/components/watch/PositionCard';
import type { FeedEvent } from '@/components/watch/feed';
import { useNetwork } from '@/components/network/NetworkProvider';
import { fromJson, type PositionV2Json } from '@/lib/positionTypes';

const MAX_EVENTS = 40;

export default function WatchPage() {
  const { address } = useAccount();
  const { network } = useNetwork();
  const positionsQ = useQuery({
    queryKey: ['positions', network, address],
    enabled: Boolean(address),
    refetchInterval: 3000,
    queryFn: async () => {
      const r = await fetch(`/api/positions/${address}?network=${network}`);
      if (!r.ok) throw new Error(`Positions unavailable (${r.status})`);
      return ((await r.json()) as { positions: PositionV2Json[] }).positions.map(fromJson);
    },
  });
  const eventsQ = useQuery({
    queryKey: ['watch-events', network, address],
    enabled: Boolean(address),
    refetchInterval: 3000,
    queryFn: async (): Promise<FeedEvent[]> => {
      const r = await fetch(`/api/watch/events?network=${network}&owner=${address}`);
      if (!r.ok) throw new Error(`Events unavailable (${r.status})`);
      const { events } = (await r.json()) as { events: FeedEvent[] };
      return [...events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_EVENTS);
    },
  });
  const positions = positionsQ.data ?? [];

  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Watch</h1>
      <p className="mt-1 text-[14px] text-secondary">
        Your positions on Monad {network === 'mainnet' ? 'Mainnet' : 'Testnet'}, Jev&apos;s latest onchain verdict, and the Guardian rule that exits for you.{' '}
        <Link href="/app/ledger" className="text-ink underline decoration-hairline underline-offset-4">See every verdict</Link>
      </p>

      {!address ? (
        <p className="mt-8 rounded-xl border border-dashed border-hairline p-5 text-[13px] text-secondary">Connect your wallet (top right) to see your positions.</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <section aria-label="Positions">
            <h2 className="mono mb-3 text-[10.5px] uppercase tracking-[0.06em] text-muted">Positions</h2>
            {positionsQ.isError && (
              <p role="alert" className="mb-3 rounded-xl border border-avoid/40 bg-white p-3 text-[13px] text-avoid">
                {positionsQ.error.message}
              </p>
            )}
            {positionsQ.isPending && <p className="text-[13px] text-muted">Reading your positions…</p>}
            {positionsQ.data && positions.length === 0 && (
              <p className="rounded-xl border border-dashed border-hairline p-5 text-[13px] text-secondary">
                No positions on this network yet. <Link href="/app/advisor" className="underline underline-offset-4">Deposit via the Advisor</Link> first.
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {positions.map((p) => (
                <PositionCard key={p.vault.address} position={p} network={network} />
              ))}
            </div>
          </section>
          <EventFeed events={eventsQ.data ?? []} connected={eventsQ.isSuccess} positions={positions} network={network} />
        </div>
      )}
    </div>
  );
}
