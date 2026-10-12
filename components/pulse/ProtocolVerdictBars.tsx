import Link from 'next/link';
import { formatPct, formatProject, formatTvl } from '@/components/field/format';
import type { PulseStats } from './aggregate';
import { exploreHref } from './labels';
import { Key, Section } from './Section';

const SEGMENTS = [
  { key: 'deposit', label: 'Deposit', color: 'var(--deposit)' },
  { key: 'consider', label: 'Consider', color: 'var(--consider)' },
  { key: 'avoid', label: 'Avoid', color: 'var(--avoid)' },
  { key: 'notJudged', label: 'Not judged', color: 'var(--hairline)' },
] as const;

const TOP = 10;

/** Stacked TVL-by-verdict bars for the biggest protocols. Verdict colors, nothing else. */
export function ProtocolVerdictBars({ rows }: { rows: PulseStats['byProtocol'] }) {
  const top = rows.slice(0, TOP);
  const rest = rows.slice(TOP);
  const restTvl = rest.reduce((s, r) => s + r.tvl, 0);
  const max = Math.max(1, ...top.map((r) => r.tvl));
  const used = SEGMENTS.filter((s) => top.some((r) => r[s.key] > 0));
  const names = top.map((r) => formatProject(r.project));
  const nameOf = (r: (typeof top)[number], i: number) => (names.indexOf(names[i]) !== i || names.lastIndexOf(names[i]) !== i ? r.project : names[i]);

  return (
    <Section
      eyebrow="Verdicts by protocol"
      title="Who holds the real yield"
      note={`TVL split by verdict for the ${top.length} largest protocols.`}
      legend={used.map((s) => <Key key={s.key} color={s.color} label={s.label} />)}
    >
      <ul className="space-y-1">
        {top.map((r, i) => {
          const name = nameOf(r, i);
          const detail = SEGMENTS.filter((s) => r[s.key] > 0)
            .map((s) => `${s.label} ${formatTvl(r[s.key])}`)
            .join(' · ');
          return (
            <li key={r.project}>
              <Link
                href={exploreHref({ project: r.project })}
                title={`${name}: ${formatTvl(r.tvl)} — ${detail}`}
                className="group -mx-2 block rounded-[3px] px-2 py-2 transition-colors hover:bg-paper focus-visible:bg-paper sm:grid sm:grid-cols-[132px_1fr_58px] sm:items-center sm:gap-3"
              >
                <span className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px] sm:mb-0 sm:block sm:truncate">
                  {name}
                  <span className="mono text-[11px] text-secondary sm:hidden">{formatTvl(r.tvl)}</span>
                </span>
                <span className="flex h-[16px] items-center">
                  <span className="flex h-full gap-[2px]" style={{ width: `${(r.tvl / max) * 100}%`, minWidth: 4 }}>
                    {SEGMENTS.filter((s) => r[s.key] > 0).map((s, si, all) => (
                      <span
                        key={s.key}
                        className={`block h-full transition-opacity group-hover:opacity-85 ${si === 0 ? 'rounded-l-[2px]' : ''} ${si === all.length - 1 ? 'rounded-r-[4px]' : ''}`}
                        style={{ flexGrow: r[s.key], flexBasis: 0, minWidth: 2, background: s.color }}
                      />
                    ))}
                  </span>
                </span>
                <span className="mono hidden text-right text-[11px] text-secondary sm:block">{formatTvl(r.tvl)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <p className="mono mt-4 text-[11px] text-muted">
          + {rest.length} more protocols · {formatTvl(restTvl)} · {formatPct((restTvl / rows.reduce((s, r) => s + r.tvl, 0)) * 100)} of TVL
        </p>
      )}
      <div className="sr-only"><table>
        <caption>TVL by verdict for the largest protocols</caption>
        <thead><tr><th>Protocol</th><th>TVL</th>{SEGMENTS.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>
          {top.map((r, i) => (
            <tr key={r.project}>
              <td>{nameOf(r, i)}</td><td>{formatTvl(r.tvl)}</td>
              {SEGMENTS.map((s) => <td key={s.key}>{formatTvl(r[s.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table></div>
    </Section>
  );
}
