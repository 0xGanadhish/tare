'use client';

import { explainExitAlert, explainJudgment } from '@/shared/explain';
import type { Network } from '@/shared/networks';
import type { PositionV2 } from '@/lib/positions';
import { txUrl, shortHash } from '@/components/tx/explorer';
import { ExitButton } from './PositionCard';
import { exitErrorText, partialDetail, type FeedEvent } from './feed';

const TONE: Record<string, string> = {
  stats_changed: 'text-secondary',
  judged: 'text-ink',
  jev_unavailable: 'text-avoid',
  posted: 'text-ink',
  alert: 'text-avoid',
  exit_sent: 'text-ink',
  exit_confirmed: 'text-deposit',
  exit_partial: 'text-avoid',
  exit_failed: 'text-avoid',
};
const TITLE: Record<string, string> = {
  stats_changed: 'Vault stats changed',
  judged: 'Jev judged',
  jev_unavailable: 'Jev unavailable',
  posted: 'Verdict posted onchain',
  alert: 'Alert',
  exit_sent: 'Exit sent',
  exit_confirmed: 'Exit confirmed',
  exit_partial: 'Partial exit',
  exit_failed: 'Exit failed',
};

export interface EventFeedProps { events: FeedEvent[]; connected: boolean; positions: PositionV2[]; network: Network }

export function EventFeed({ events, connected, positions, network }: EventFeedProps) {
  return (
    <section aria-label="Live events">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Live feed</h2>
        <span className="mono text-[10.5px] text-muted">{connected ? '● live' : '○ not connected'}</span>
      </div>
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-4 text-[12.5px] text-muted">
          No events yet. Verdicts, alerts and exits for your positions appear here as they happen.
        </p>
      ) : (
        <ol className="divide-y divide-hairline/70">
          {events.map((e) => (
            <EventRow key={e.id} e={e} network={network} position={positions.find((p) => p.vault.address.toLowerCase() === e.vault.toLowerCase())} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Plain wording, recomputed from the data so events written before the wording changed read the same. */
function describe(e: FeedEvent): string {
  if (e.type === 'judged' && e.judgment) return explainJudgment(e.judgment);
  if (e.type === 'alert' && e.confidence != null && e.message.startsWith('Jev suggests')) return explainExitAlert(e.confidence);
  return e.message;
}

function EventRow({ e, position, network }: { e: FeedEvent; position?: PositionV2; network: Network }) {
  const time = new Date(e.at).toLocaleTimeString('en-GB', { hour12: false });
  const secs = e.message.match(/(\d+(?:\.\d+)?)\s*s\b/)?.[1];
  const partial = partialDetail(e);
  const link = e.txHash ? <TxLink hash={e.txHash} network={network} /> : null;
  return (
    <li className={`py-3 text-[13px] ${e.type === 'exit_failed' ? 'rounded-lg border border-avoid/40 bg-white px-3' : ''}`}>
      <div className="flex items-baseline gap-3">
        <span className="mono shrink-0 text-[10.5px] text-muted">{time}</span>
        <span className={`mono shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] ${TONE[e.type] ?? 'text-secondary'}`}>{TITLE[e.type] ?? e.type}</span>
      </div>
      {partial ? (
        <p className="mt-1 font-medium text-ink">
          Partly out · {partial}
          {link}
        </p>
      ) : e.type === 'exit_confirmed' ? (
        <p className="mt-1 font-medium text-ink">
          You&apos;re out · confirmed in {secs ? `${secs}s` : 'one block'}
          {link}
        </p>
      ) : e.type === 'jev_unavailable' ? (
        <p role="status" className="mt-1 rounded-lg border border-avoid/40 bg-avoid/5 px-3 py-2 text-ink">
          {e.message}
        </p>
      ) : e.type === 'exit_failed' ? (
        <p role="alert" className="mt-1 font-medium text-avoid">
          Exit failed: {exitErrorText(e.message)}
        </p>
      ) : (
        <p className="mt-1 text-secondary">
          {describe(e)}
          {link}
        </p>
      )}
      {(e.type === 'alert' || e.type === 'exit_failed' || partial) && position && position.shares > 0n && (
        <div className="mt-2">
          <ExitButton position={position} label="Exit" />
        </div>
      )}
    </li>
  );
}

function TxLink({ hash, network }: { hash: string; network: Network }) {
  return (
    <>
      {' · '}
      <a href={txUrl(hash, network)} target="_blank" rel="noopener noreferrer" className="mono text-[11.5px] underline decoration-hairline underline-offset-4 hover:decoration-ink">
        {shortHash(hash)} ↗
      </a>
    </>
  );
}
