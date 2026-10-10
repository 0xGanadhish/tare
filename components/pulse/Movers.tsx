import Link from 'next/link';
import { formatPct, formatProject } from '@/components/field/format';
import type { VerdictLabel } from '@/shared/types';
import type { PulseStats } from './aggregate';
import { exploreHref, formatSigned } from './labels';
import { Section } from './Section';

export interface MoverContext {
  apy: number;
  label: VerdictLabel | null;
}

const DOT: Record<VerdictLabel, string> = {
  DEPOSIT: 'var(--deposit)',
  CONSIDER: 'var(--consider)',
  AVOID: 'var(--avoid)',
  NOT_JUDGED: 'var(--hairline)',
};

/** Top 5 relative 7-day APY changes. Direction is an arrow glyph; color is reserved for the verdict dot. */
export function Movers({ movers, context }: { movers: PulseStats['movers']; context: Record<string, MoverContext> }) {
  return (
    <Section
      eyebrow="7-day movers"
      title="Biggest APY swings"
      note="Relative change in headline APY over the last week."
    >
      <ol className="divide-y divide-hairline border-y border-hairline">
        {movers.map((m, i) => {
          const c = context[m.poolId];
          const up = m.apyPct7D > 0;
          return (
            <li key={m.poolId}>
              <Link
                href={exploreHref({ pool: m.poolId })}
                title={`${formatProject(m.project)} ${m.symbol}: ${formatSigned(m.apyPct7D)} over 7 days`}
                className="group -mx-2 flex items-center gap-3 px-2 py-3.5 transition-colors hover:bg-paper focus-visible:bg-paper"
              >
                <span className="mono w-4 shrink-0 text-[11px] text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px]">
                    {c?.label && (
                      <span
                        aria-label={c.label.toLowerCase().replace('_', ' ')}
                        className="inline-block h-[8px] w-[8px] shrink-0 rounded-full"
                        style={c.label === 'CONSIDER' ? { border: '1.5px solid var(--consider)' } : { background: DOT[c.label] }}
                      />
                    )}
                    <span className="truncate">{m.symbol}</span>
                  </span>
                  <span className="mono mt-0.5 block truncate text-[11px] text-muted">
                    {formatProject(m.project)}
                    {c && ` · ${formatPct(c.apy)} APY`}
                  </span>
                </span>
                <span className="mono shrink-0 text-right text-[14px] font-medium">
                  <span aria-hidden className="mr-1.5 text-muted">{up ? '↑' : '↓'}</span>
                  {formatSigned(m.apyPct7D)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
