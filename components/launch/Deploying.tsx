import Link from 'next/link';

export function Deploying() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">Launch · Monad testnet</p>
      <h1 className="display mt-5 text-4xl sm:text-5xl">Launch contracts deploying</h1>
      <p className="mt-5 max-w-lg text-sm leading-relaxed text-secondary">
        Yield-backed tokens are on their way. Creating and trading will open when the launch contracts are deployed.
      </p>
      <div className="mt-10 border-t border-hairline pt-5">
        <Link href="/app/explore" className="text-sm text-ink underline decoration-hairline underline-offset-4">Explore yields →</Link>
      </div>
    </section>
  );
}
