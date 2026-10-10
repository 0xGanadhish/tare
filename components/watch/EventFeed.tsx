'use client';

import { useEffect, useState } from 'react';
import { explainExitAlert, explainJudgment } from '@/shared/explain';
import { txUrl, shortHash } from '@/components/tx/explorer';
import type { Position, WatchEvent } from '@/shared/types';
import { ExitButton } from './PositionCard';

const MAX_EVENTS = 40;

/** Subscribes to /api/watch/stream and keeps the newest events first. */
export function useWatchEvents(): { events: WatchEvent[]; connected: boolean } {
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const es = new EventSource('/api/watch/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as WatchEvent;
        setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev].slice(0, MAX_EVENTS)));
      } catch {
        /* ignore malformed lines */
      }
    };
    return () => es.close();
  }, []);
  return { events, connected };
}

const TONE: Record<WatchEvent['type'], string> = {
  stats_changed: 'text-secondary',
  judged: 'text-ink',
  alert: 'text-avoid',
  exit_sent: 'text-ink',
  exit_confirmed: 'text-deposit',
  exit_failed: 'text-avoid',
};
const TITLE: Record<WatchEvent['type'], string> = {
  stats_changed: 'Vault stats changed',
  judged: 'Jev judged',
  alert: 'Alert',
  exit_sent: 'Exit sent',
  exit_confirmed: 'Exit confirmed',
  exit_failed: 'Exit failed',
};

export function EventFeed({ events, connected, positions }: { events: WatchEvent[]; connected: boolean; positions: Position[] }) {
  return (
    <section aria-label="Live events">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Live feed</h2>
        <span className="mono text-[10.5px] text-muted">{connected ? '● streaming' : '○ not connected'}</span>
      </div>
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-4 text-[12.5px] text-muted">
          Live watchdog runs on the presenter&apos;s machine. Events appear here the moment it judges your positions.
        </p>
      ) : (
        <ol className="divide-y divide-hairline/70">
          {events.map((e) => (
            <EventRow key={e.id} e={e} position={positions.find((p) => p.vault.toLowerCase() === e.vault.toLowerCase())} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Plain wording, recomputed from the data so events written before the wording changed read the same. */
function describe(e: WatchEvent): string {
  if (e.type === 'judged' && e.judgment) return explainJudgment(e.judgment);
  if (e.type === 'alert' && e.confidence != null && e.message.startsWith('Jev suggests')) return explainExitAlert(e.confidence);
  return e.message;
}

function EventRow({ e, position }: { e: WatchEvent; position?: Position }) {
  const time = new Date(e.at).toLocaleTimeString('en-GB', { hour12: false });
  const secs = e.message.match(/(\d+(?:\.\d+)?)\s*s\b/)?.[1];
  return (
    <li className={`py-3 text-[13px] ${e.type === 'exit_failed' ? 'rounded-lg border border-avoid/40 bg-white px-3' : ''}`}>
      <div className="flex items-baseline gap-3">
        <span className="mono shrink-0 text-[10.5px] text-muted">{time}</span>
        <span className={`mono shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] ${TONE[e.type]}`}>{TITLE[e.type]}</span>
      </div>
      {e.type === 'exit_confirmed' && e.message.includes('still locked') ? (
        <p className="mt-1 font-medium text-ink">
          Partly out · {e.message.split(' · partial: ')[1]}
          {e.txHash && <TxLink hash={e.txHash} />}
        </p>
      ) : e.type === 'exit_confirmed' ? (
        <p className="mt-1 font-medium text-ink">
          You&apos;re out · confirmed in {secs ? `${secs}s` : 'one block'}
          {e.txHash && <TxLink hash={e.txHash} />}
        </p>
      ) : e.type === 'exit_failed' ? (
        <p role="alert" className="mt-1 font-medium text-avoid">
          Exit failed: {e.message}
        </p>
      ) : (
        <p className="mt-1 text-secondary">
          {describe(e)}
          {e.txHash && <TxLink hash={e.txHash} />}
        </p>
      )}
      {(e.type === 'alert' || e.type === 'exit_failed') && position && position.shares !== '0' && (
        <div className="mt-2">
          <ExitButton position={position} label="Exit" />
        </div>
      )}
    </li>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <>
      {' · '}
      <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="mono text-[11.5px] underline decoration-hairline underline-offset-4 hover:decoration-ink">
        {shortHash(hash)} ↗
      </a>
    </>
  );
}
