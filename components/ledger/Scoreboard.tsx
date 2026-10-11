import type { LedgerScore } from '@/shared/score';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);

/** Hit rate by confidence band and the Brier score of riskBps vs adverse, always with n (spec §7). */
export function Scoreboard({ score }: { score: LedgerScore }) {
  return (
    <section aria-label="Scoreboard" className="rounded-[14px] bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Scoreboard · resolved verdicts</h2>
        {score.early && (
          <span className="mono rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-secondary">Early data</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-[auto_auto_1fr]">
        <Tile k="Resolved" v={String(score.n)} />
        <Tile k="Brier score" v={score.brier == null ? '–' : score.brier.toFixed(3)} hint="0 is perfect, 0.25 is a coin flip" />
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] text-muted">Hit rate by Jev&apos;s confidence</div>
          <dl className="mono mt-1 grid grid-cols-4 gap-2 text-[12px]">
            {score.bands.map((b) => (
              <div key={b.band}>
                <dt className="text-muted">{b.band}%</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {pct(b.hitRate)} <span className="text-[10.5px] font-normal text-muted">n={b.n}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Tile({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{k}</div>
      <div className="mono mt-0.5 text-[22px] tabular-nums tracking-tight">{v}</div>
      {hint && <div className="text-[10.5px] text-muted">{hint}</div>}
    </div>
  );
}
