import type { LedgerScore } from '@/shared/score';
import type { Network } from '@/shared/networks';
import { MIN_BAND_VERDICTS, scoreSummary, verdictCount } from './format';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
/** Mainnet verdicts #16–#155: one EXIT re-posted every 30 s on 15 Oct by the outflow-trigger bug. All graded clear, so all misses. */
const DUPLICATE_EXITS = 140;

/** Graded verdicts in one plain sentence, how often they were right by confidence band, and the Brier score on request (spec §7). */
export function Scoreboard({ score, network }: { score: LedgerScore; network: Network }) {
  const { right, graded, sentence } = scoreSummary(score, network);
  return (
    <section aria-label="Scoreboard" className="rounded-[14px] bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Scoreboard · graded verdicts</h2>
        {score.early && (
          <span className="mono rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-secondary">Early data</span>
        )}
      </div>
      {network === 'mainnet' && graded > DUPLICATE_EXITS && (
        <p role="note" aria-label="About the 15 Oct verdicts" className="mt-3 rounded-xl border border-dashed border-hairline p-3 text-[12px] leading-relaxed text-secondary">
          <span className="font-medium text-ink">About the 15 Oct verdicts.</span> One $2M withdrawal from Clearstar set off a bug that re-posted
          the same EXIT every 30 seconds: 140 copies (#16–#155) of one call. The vault didn&apos;t fall further, so all 140 graded clear and pull
          this score down. Leaving them out, Jev was right {right} of {graded - DUPLICATE_EXITS} times ({pct(right / (graded - DUPLICATE_EXITS))}). Guardian still exited the protected position 10 seconds after
          the first EXIT. The bug is fixed; the onchain record stays as posted.
        </p>
      )}
      <p className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.01em] sm:text-[22px]">{sentence}</p>
      {graded > 0 && (
        <>
          <dl className="mt-3 flex gap-6">
            <Tile k="Graded" v={String(graded)} />
            <Tile k="Right" v={pct(right / graded)} />
          </dl>
          <div className="mt-4">
            <div className="text-[11px] text-muted">Right, by confidence</div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-3 text-[12px] sm:grid-cols-4">
              {score.bands.map((b) => {
                const thin = b.n < MIN_BAND_VERDICTS;
                return (
                  <div key={b.band} data-thin={thin || undefined} className={thin ? 'text-muted' : ''}>
                    <dt className="mono text-muted">{b.band.replace('-', '–')}%</dt>
                    <dd className="mt-0.5">
                      <span className={`mono tabular-nums ${thin ? '' : 'font-medium text-ink'}`}>{pct(b.hitRate)}</span>
                      <span className={`block text-[11px] ${thin ? '' : 'text-secondary'}`}>{verdictCount(b.n)}</span>
                      {thin && <span className="block text-[11px]">too few to judge</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </>
      )}
      {network === 'testnet' && (
        <p role="note" className="mt-4 rounded-xl border border-dashed border-hairline p-3 text-[12px] leading-relaxed text-secondary">
          This testnet record includes demo stress tests, where a vault is pushed into trouble and then reset before grading. The real track
          record is on mainnet.
        </p>
      )}
      {score.brier != null && (
        <details className="mt-3 text-[12px] text-secondary">
          <summary className="cursor-pointer select-none text-[12px] text-secondary hover:text-ink">How we score this</summary>
          <p className="mt-1.5 leading-relaxed">
            A verdict is right when an EXIT is followed by trouble in the vault, or a HOLD or MOVE by none.
          </p>
          <p className="mt-1 leading-relaxed">
            Brier score <span className="mono text-ink">{score.brier.toFixed(3)}</span>. It measures how close the risk forecasts came to what
            happened: 0 means every forecast matched. Lower is better.
          </p>
        </details>
      )}
    </section>
  );
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="mono mt-0.5 text-[18px] tabular-nums tracking-tight">{v}</dd>
    </div>
  );
}
