import Link from 'next/link';
import { formatPct } from '@/components/field/format';
import type { PulseStats } from './aggregate';
import { ASSET_CLASS_LABEL, exploreHref } from './labels';
import { Key, Section } from './Section';

const HEADLINE = 'var(--faint)';
const REAL = 'var(--ink)';

/** Paired horizontal bars: median headline vs median real APY, one pair per asset class. */
export function ApyGapBars({ rows }: { rows: PulseStats['byAssetClass'] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.headlineApyMedian, r.realApyMedian]));
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <Section
      eyebrow="Headline vs real"
      title="What the APY says, and what's left"
      note="Median per asset class. Real APY strips out token emissions."
      legend={
        <>
          <Key color={HEADLINE} label="Headline APY" />
          <Key color={REAL} label="Real APY" />
        </>
      }
    >
      <ul className="space-y-1">
        {rows.map((r) => {
          const gap = r.headlineApyMedian - r.realApyMedian;
          const name = ASSET_CLASS_LABEL[r.assetClass];
          return (
            <li key={r.assetClass}>
              <Link
                href={exploreHref({ assetClass: r.assetClass })}
                title={`${name}: headline ${formatPct(r.headlineApyMedian)}, real ${formatPct(r.realApyMedian)} (median)`}
                className="group -mx-2 block rounded-[3px] px-2 py-2.5 transition-colors hover:bg-paper focus-visible:bg-paper"
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px]">{name}</span>
                  <span className="mono text-[11px] text-muted">
                    {gap > 0.05 ? `−${gap.toFixed(1)} pts` : 'no gap'}
                  </span>
                </div>
                {[
                  { v: r.headlineApyMedian, c: HEADLINE },
                  { v: r.realApyMedian, c: REAL },
                ].map((b) => (
                  <div key={b.c} className="flex h-[14px] items-center gap-2 first:mb-[2px]">
                    <div className="relative h-full flex-1">
                      <div
                        className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                        style={{ width: pct(b.v), minWidth: b.v > 0 ? 2 : 0, background: b.c }}
                      />
                    </div>
                    <span className="mono w-[46px] shrink-0 text-right text-[11px] text-secondary">{formatPct(b.v)}</span>
                  </div>
                ))}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="sr-only"><table>
        <caption>Median headline and real APY by asset class</caption>
        <thead><tr><th>Asset class</th><th>Headline APY</th><th>Real APY</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assetClass}>
              <td>{ASSET_CLASS_LABEL[r.assetClass]}</td><td>{formatPct(r.headlineApyMedian)}</td><td>{formatPct(r.realApyMedian)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Section>
  );
}
