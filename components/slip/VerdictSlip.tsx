import type { ReactNode } from 'react';
import type { Pool, Verdict, VerdictLabel } from '@/shared/types';
import { poolDetailsUrl, protocolUrl } from '@/shared/protocols';
import { explainFlag } from '@/shared/explain';
import { formatPct, formatPoolName, formatProject, formatTvl } from '@/components/field/format';

const STAMP: Record<VerdictLabel, { text: string; cls: string }> = {
  DEPOSIT: { text: 'DEPOSIT', cls: 'border-deposit text-deposit' },
  CONSIDER: { text: 'CONSIDER', cls: 'border-soft text-secondary' },
  AVOID: { text: 'AVOID', cls: 'border-avoid text-avoid' },
  NOT_JUDGED: { text: 'NOT JUDGED', cls: 'border-faint text-muted' },
};

export function exitRiskLabel(v: Verdict | undefined): string {
  if (!v || v.risk == null) return '–';
  return v.risk <= 2 ? 'Low' : v.risk <= 3 ? 'Medium' : 'High';
}

export interface VerdictSlipProps {
  pool: Pool;
  verdict?: Verdict;
  /** 90-day APY series, rendered as a sparkline when present. */
  history?: { t: string; apy: number }[];
  /** Slot under the rows, e.g. a deposit flow. */
  action?: ReactNode;
  /** Tilt the card like the printed slip in the Object mockup (landing-style hero use). */
  tilt?: boolean;
  className?: string;
}

/** Paper verdict slip (spec §5): stamp, rows, "why" flags, optional action slot. */
export function VerdictSlip({ pool, verdict, history, action, tilt, className }: VerdictSlipProps) {
  const label: VerdictLabel = verdict?.label ?? 'NOT_JUDGED';
  const stamp = STAMP[label];
  const judged = label !== 'NOT_JUDGED';
  const rows: [string, string][] = [
    ['Real APY', formatPct(pool.realApy, 2)],
    ['From incentives', `${Math.round(pool.incentiveShare * 100)}%`],
    ['Exit risk', exitRiskLabel(verdict)],
    ['TVL', formatTvl(pool.tvlUsd)],
    ['Confidence', judged ? `${Math.round(verdict!.confidence * 100)}%` : '–'],
  ];
  return (
    <article
      className={`relative rounded-[14px] bg-paper px-5 pb-4 pt-[18px] text-left shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_30px_50px_-20px_rgba(32,0,82,0.28),0_6px_14px_-6px_rgba(32,0,82,0.18)] ${
        tilt ? '-rotate-[2.2deg]' : ''
      } ${className ?? ''}`}
    >
      <div className="mono flex justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted">
        <span>Verdict · {pool.id.slice(0, 4).toUpperCase()}</span>
        <span />
      </div>
      <h3 className="mt-1 max-w-[58%] text-[19px] font-semibold leading-tight tracking-[-0.02em]">{formatPoolName(pool)}</h3>
      {/* Several pools can share a protocol and token (e.g. two Accountable AUSD vaults): name the variant, else its size. */}
      <p className="mt-0.5 max-w-[58%] text-[12px] leading-snug text-secondary">{pool.meta ?? `${formatTvl(pool.tvlUsd)} pool`}</p>
      <div
        className={`mono absolute right-[18px] top-[34px] -rotate-[9deg] rounded-md border-[2.5px] px-2.5 py-[5px] text-[13px] font-semibold tracking-[0.14em] opacity-90 ${stamp.cls}`}
        aria-label={`Verdict: ${stamp.text}`}
      >
        {stamp.text}
      </div>
      <div className="mt-4 border-t-[1.5px] border-dashed border-[#e2dfea] pt-4">
        <dl className="grid grid-cols-2 gap-y-2.5 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="mono text-right font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {history && history.length > 1 && (
        <div className="mt-4">
          <div className="mono mb-1 text-[10px] uppercase tracking-[0.06em] text-muted">APY · {history.length} days</div>
          <Sparkline values={history.map((h) => h.apy)} color={label === 'AVOID' ? 'var(--avoid)' : 'var(--deposit)'} />
        </div>
      )}
      <div className="mt-4 border-t border-hairline pt-3">
        <div className="mono mb-1.5 text-[10px] uppercase tracking-[0.06em] text-muted">Why</div>
        {verdict && verdict.flags.length > 0 ? (
          <ul className="space-y-1.5 text-[12.5px] leading-snug text-secondary">
            {verdict.flags.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink/40" />
                <span>{explainFlag(f, { confidence: false })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted">
            {judged ? 'No flags raised.' : 'Not judged yet. Real APY above is computed from the data; nothing is auto-executed.'}
          </p>
        )}
      </div>
      <PoolLinks pool={pool} />
      {action && <div className="mt-4 border-t border-hairline pt-4">{action}</div>}
    </article>
  );
}

function PoolLinks({ pool }: { pool: Pool }) {
  const app = protocolUrl(pool.project);
  const cls = 'mono text-[11px] uppercase tracking-[0.06em] text-secondary underline-offset-4 hover:text-ink hover:underline';
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-3">
      {app && (
        <a href={app} target="_blank" rel="noopener noreferrer" className={cls}>
          Open on {formatProject(pool.project)} ↗
        </a>
      )}
      <a href={poolDetailsUrl(pool.id)} target="_blank" rel="noopener noreferrer" className={cls}>
        Pool details ↗
      </a>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 280;
  const h = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full" role="img" aria-label="APY history">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
