const STEPS = [
  {
    n: '01',
    title: 'Judge',
    body: 'Jev, the judge inside Tare, reads every pool: where the yield comes from, whether it will last, how risky the venue is. Emission-inflated APYs get called out before you deposit.',
  },
  {
    n: '02',
    title: 'Deposit',
    body: 'Say “500 USDC, safe, 3 months”. Tare ranks the real yields and you deposit with one signature. Success shows only after the chain confirms it.',
  },
  {
    n: '03',
    title: 'Watch',
    body: 'Turn on Guardian. If a vault tightens, Tare re-checks the position and Guardian can pull you out to your own wallet, before the vault locks.',
  },
];

export function Steps() {
  return (
    <section className="mx-auto mt-20 w-full max-w-[1200px] px-5 sm:mt-28 sm:px-9" aria-label="How Tare works">
      <div className="mono mb-5 text-[10.5px] uppercase tracking-[0.06em] text-muted">Judge · Deposit · Watch</div>
      <ol className="grid border-t border-hairline sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className={`border-b border-hairline py-6 sm:border-b-0 sm:py-8 ${i > 0 ? 'sm:border-l sm:pl-8' : ''} ${i < 2 ? 'sm:pr-8' : ''}`}
          >
            <div className="mono text-[11px] text-faint">{s.n}</div>
            <h2 className="display mt-3 text-[26px]">{s.title}</h2>
            <p className="mt-3 max-w-[340px] text-[14px] leading-relaxed text-secondary">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
