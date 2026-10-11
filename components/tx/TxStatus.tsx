import type { TxState } from './txReducer';
import type { Network } from '@/shared/networks';
import { shortHash, txUrl } from './explorer';

function HashLink({ hash, network }: { hash: string; network?: Network }) {
  return (
    <a href={txUrl(hash, network)} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4 hover:decoration-ink">
      {shortHash(hash)} ↗
    </a>
  );
}

/** One line of truthful transaction state; renders nothing while idle. */
export function TxStatus({ state, className, network }: { state: TxState; className?: string; network?: Network }) {
  if (state.status === 'idle') return null;
  const tone = state.status === 'failed' ? 'text-avoid' : state.status === 'confirmed' ? 'text-ink' : 'text-secondary';
  return (
    <div role="status" aria-live="polite" className={`mono text-[11.5px] leading-snug ${tone} ${className ?? ''}`}>
      {state.status === 'awaiting_signature' && 'Waiting for signature…'}
      {state.status === 'pending' && (
        <>
          Pending · <HashLink hash={state.hash} network={network} />
        </>
      )}
      {state.status === 'confirmed' && (
        <>
          Confirmed in {state.seconds.toFixed(1)}s · block {state.block.toString()} · <HashLink hash={state.hash} network={network} />
        </>
      )}
      {state.status === 'failed' && (
        <>
          Failed: {state.reason}
          {state.hash && (
            <>
              {' · '}
              <HashLink hash={state.hash} network={network} />
            </>
          )}
        </>
      )}
      {state.status === 'cancelled' && 'Cancelled in wallet'}
    </div>
  );
}
