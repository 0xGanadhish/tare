import type { ReactNode } from 'react';

/** Hairline-ruled block: mono eyebrow, display title, optional legend slot, then the chart. */
export function Section({
  eyebrow,
  title,
  note,
  legend,
  className = '',
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative border-t border-hairline py-7 ${className}`}>
      <div className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{eyebrow}</div>
      <h2 className="display mt-2 text-[22px] sm:text-[24px]">{title}</h2>
      {note && <p className="mt-1.5 max-w-[460px] text-[13px] leading-relaxed text-secondary">{note}</p>}
      {legend && <div className="mono mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-secondary">{legend}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Key({ color, label, className = '' }: { color: string; label: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`inline-block h-[9px] w-[9px] rounded-[2px] ${className}`} style={{ background: color }} />
      {label}
    </span>
  );
}
