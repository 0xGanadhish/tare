import Link from 'next/link';

const STEPS = [
  {
    n: '01',
    title: 'Judge',
    body: 'Jev, the judge inside Tare, reads each watched vault and calls it: hold, exit or move, and how sure it is. Every verdict is posted onchain with a hash of exactly what Jev saw.',
  },
  {
    n: '02',
    title: 'Protect',
    body: 'Turn on Guardian and set your own exit rule: how sure the warning must be, and how fresh. When a verdict meets it, anyone can trigger the exit, and the funds can only go to your wallet.',
  },
  {
    n: '03',
    title: 'Prove',
    body: 'Every verdict is graded onchain 24 hours after posting, against what the vault actually did. The Ledger publishes the hit rate and Brier score, and Tare can’t edit it.',
    link: { href: '/app/ledger?network=mainnet', label: 'Open the Ledger →' },
  },
];

export function Steps() {
  return (
    <section className="mx-auto mt-20 w-full max-w-[1200px] px-5 sm:mt-28 sm:px-9" aria-label="How Tare works">
      <div className="mono mb-5 text-[10.5px] uppercase tracking-[0.06em] text-muted">Judge · Protect · Prove</div>
      <ol className="grid border-t border-hairline sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className={`border-b border-hairline py-6 sm:border-b-0 sm:py-8 ${i > 0 ? 'sm:border-l sm:pl-8' : ''} ${i < 2 ? 'sm:pr-8' : ''}`}
          >
            <div className="mono text-[11px] text-faint">{s.n}</div>
            <h2 className="display mt-3 text-[26px]">{s.title}</h2>
            <p className="mt-3 max-w-[340px] text-[14px] leading-relaxed text-secondary">{s.body}</p>
            {s.link && (
              <Link href={s.link.href} className="mt-4 inline-block border-b border-ink pb-0.5 text-[13px] font-medium transition-opacity hover:opacity-70">
                {s.link.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
