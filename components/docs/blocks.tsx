import Link from 'next/link';
import type { ReactNode } from 'react';

/** Building blocks for the docs articles. Server components, no state. */

const PAPER = 'rounded-[14px] bg-paper shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_20px_40px_-26px_rgba(32,0,82,0.22),0_4px_10px_-6px_rgba(32,0,82,0.12)]';
export const paper = PAPER;

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mono text-[10.5px] uppercase tracking-[0.08em] text-muted ${className}`}>{children}</div>;
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 scroll-mt-28">
      <h2 id={id} className="text-[20px] font-semibold tracking-[-0.02em] sm:text-[22px]">
        <a href={`#${id}`} className="group">
          {title}
          <span aria-hidden className="ml-2 text-faint opacity-0 transition-opacity group-hover:opacity-100">#</span>
        </a>
      </h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-[1.7] text-secondary">{children}</div>
    </section>
  );
}

/** A titled code sample: a label bar (language or file) over a scrollable monospace block. */
export function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className={`${PAPER} mt-4 overflow-hidden`}>
      <div className="mono border-b border-hairline px-4 py-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <pre className="mono overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed text-ink">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="mono rounded-[5px] border border-hairline bg-white px-1.5 py-[1px] text-[12.5px] text-ink">{children}</code>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http');
  const cls = 'text-ink underline decoration-hairline decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-ink';
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** The single sentence to remember from a page. */
export function OneLine({ children }: { children: ReactNode }) {
  return (
    <div className={`${PAPER} relative mt-8 overflow-hidden p-5 sm:p-6`}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-deposit" />
      <Eyebrow>In one line</Eyebrow>
      <p className="mt-2 text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink sm:text-[19px]">{children}</p>
    </div>
  );
}

export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="mt-4 space-y-0">
      {items.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className="absolute left-[13px] top-8 bottom-1 w-px bg-hairline" />}
          <span className="mono relative flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>
          <div className="pt-[3px]">
            <div className="text-[14.5px] font-medium text-ink">{s.title}</div>
            <div className="mt-1 text-[14px] leading-[1.65] text-secondary">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export type Tone = 'deposit' | 'avoid' | 'ink';
const TONE: Record<Tone, string> = { deposit: 'text-deposit', avoid: 'text-avoid', ink: 'text-ink' };

/** Number tiles: the few values a reader should carry away. */
export function Facts({ items }: { items: { k: string; v: string; hint?: string; tone?: Tone }[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((f) => (
        <div key={f.k} className={`${PAPER} p-4`}>
          <dt className="mono text-[10px] uppercase tracking-[0.08em] text-muted">{f.k}</dt>
          <dd className={`mono mt-1.5 text-[20px] font-medium leading-tight tracking-[-0.02em] sm:text-[22px] ${TONE[f.tone ?? 'ink']}`}>{f.v}</dd>
          {f.hint && <dd className="mt-1 text-[12px] leading-snug text-secondary">{f.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = 'note', title, children }: { tone?: 'note' | 'warn'; title: string; children: ReactNode }) {
  const box = tone === 'warn' ? 'border-avoid/35 bg-avoid/[0.05]' : 'border-deposit/30 bg-deposit/[0.05]';
  const dot = tone === 'warn' ? 'bg-avoid' : 'bg-deposit';
  return (
    <div role="note" className={`mt-5 rounded-xl border p-4 ${box}`}>
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {title}
      </div>
      <div className="mt-1.5 text-[13.5px] leading-[1.65] text-secondary">{children}</div>
    </div>
  );
}

/** Rule checklist (Guardian's checks, grading criteria). */
export function Checklist({ items, mark = '✓', label }: { items: ReactNode[]; mark?: string; label?: string }) {
  return (
    <ul aria-label={label} className="mt-4 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-white">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 px-4 py-3 text-[14px] leading-snug text-secondary">
          <span aria-hidden className="mono mt-[1px] text-[12px] text-deposit">{mark}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Terms({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="border-t border-hairline pt-3">
          <dt className="text-[14px] font-medium text-ink">{k}</dt>
          <dd className="mt-1 text-[13.5px] leading-[1.6] text-secondary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const STAMP: Record<string, string> = {
  DEPOSIT: 'border-deposit text-deposit',
  HOLD: 'border-deposit text-deposit',
  CONSIDER: 'border-soft text-secondary',
  MOVE: 'border-soft text-secondary',
  AVOID: 'border-avoid text-avoid',
  EXIT: 'border-avoid text-avoid',
};

/** A verdict as it looks on the slip. */
export function Stamp({ label, tilt = false }: { label: string; tilt?: boolean }) {
  return (
    <span className={`mono inline-block rounded-[5px] border-2 px-1.5 py-[1px] text-[11px] font-semibold tracking-[0.12em] ${STAMP[label] ?? 'border-faint text-muted'} ${tilt ? '-rotate-[6deg]' : ''}`}>
      {label}
    </span>
  );
}

/** Rows that pair a verdict stamp with what it means. */
export function VerdictRows({ rows }: { rows: { label: string; body: ReactNode }[] }) {
  return (
    <div className={`${PAPER} mt-4 divide-y divide-dashed divide-[#e2dfea] px-5`}>
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:gap-5">
          <div className="w-[104px] shrink-0">
            <Stamp label={r.label} />
          </div>
          <div className="text-[14px] leading-[1.6] text-secondary">{r.body}</div>
        </div>
      ))}
    </div>
  );
}

/** "Follow one dollar": the whole protocol as six steps. Horizontal on wide screens, a timeline on phones. */
export function Flow({ steps }: { steps: { k: string; title: string; body: string; accent?: boolean }[] }) {
  return (
    <ol className="mt-6 grid gap-3 md:grid-cols-3 lg:grid-cols-6 lg:gap-2">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className={`relative p-4 ${s.accent ? 'rounded-[14px] bg-ink text-white' : `${PAPER}`}`}
        >
          <div className={`mono flex items-center justify-between text-[10px] uppercase tracking-[0.08em] ${s.accent ? 'text-faint' : 'text-muted'}`}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <span>{s.k}</span>
          </div>
          <div className={`mt-3 text-[14px] font-medium leading-tight ${s.accent ? 'text-white' : 'text-ink'}`}>{s.title}</div>
          <p className={`mt-1.5 text-[12.5px] leading-snug ${s.accent ? 'text-consider' : 'text-secondary'}`}>{s.body}</p>
          {i < steps.length - 1 && (
            <span aria-hidden className="mono absolute -right-[9px] top-1/2 z-10 hidden -translate-y-1/2 text-[13px] text-faint lg:block">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-white">
      <table className="w-full min-w-[480px] text-left text-[13.5px]">
        <thead>
          <tr className="mono border-b border-hairline text-[10.5px] uppercase tracking-[0.06em] text-muted">
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 leading-snug ${j === 0 ? 'font-medium text-ink' : 'text-secondary'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
