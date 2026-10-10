'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { EventFeed, useWatchEvents } from '@/components/watch/EventFeed';
import { PositionCard } from '@/components/watch/PositionCard';
import type { Position } from '@/shared/types';

export default function WatchPage() {
  const { address } = useAccount();
  const { events, connected } = useWatchEvents();
  const q = useQuery({
    queryKey: ['positions', address],
    enabled: Boolean(address),
    refetchInterval: 3000,
    queryFn: async (): Promise<Position[]> => {
      const r = await fetch(`/api/positions/${address}`);
      if (!r.ok) throw new Error(`Positions unavailable (${r.status})`);
      return ((await r.json()) as { positions: Position[] }).positions;
    },
  });
  const positions = q.data ?? [];
  const mine = events.filter(
    (e) => (e.owner ? e.owner.toLowerCase() === address?.toLowerCase() : positions.some((p) => p.vault.toLowerCase() === e.vault.toLowerCase())),
  );

  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Watch</h1>
      <p className="mt-1 text-[14px] text-secondary">Your mirror positions, Jev&apos;s latest judgment, and the Guardian that exits for you. <a href="/app/admin#how" className="text-ink underline decoration-hairline underline-offset-4">How Jev decides</a></p>

      {!address ? (
        <p className="mt-8 rounded-xl border border-dashed border-hairline p-5 text-[13px] text-secondary">Connect your wallet (top right) to see your positions.</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <section aria-label="Positions">
            <h2 className="mono mb-3 text-[10.5px] uppercase tracking-[0.06em] text-muted">Positions</h2>
            {q.isError && (
              <p role="alert" className="mb-3 rounded-xl border border-avoid/40 bg-white p-3 text-[13px] text-avoid">
                {q.error.message}
              </p>
            )}
            {q.isPending && <p className="text-[13px] text-muted">Reading your positions…</p>}
            {q.data && positions.length === 0 && (
              <p className="rounded-xl border border-dashed border-hairline p-5 text-[13px] text-secondary">
                No positions yet. <Link href="/app/advisor" className="underline underline-offset-4">Deposit via the Advisor</Link> first.
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {positions.map((p) => (
                <PositionCard key={p.vault} position={p} />
              ))}
            </div>
          </section>
          <EventFeed events={mine} connected={connected} positions={positions} />
        </div>
      )}
    </div>
  );
}
