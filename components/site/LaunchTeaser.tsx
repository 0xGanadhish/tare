import Link from 'next/link';
import { SITE_NAV } from '@/components/ui/navItems';

export function LaunchTeaser() {
  const launch = SITE_NAV.find((n) => n.label === 'Launch');
  if (!launch || launch.hidden) return null;
  return (
    <section className="mx-auto mt-16 w-full max-w-[1200px] px-5 sm:mt-24 sm:px-9">
      <div className="flex flex-col gap-6 rounded-2xl border border-hairline bg-paper px-6 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-10">
        <div>
          <div className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Launch</div>
          <h2 className="display mt-3 max-w-[460px] text-[28px] sm:text-[34px]">
            A token whose reserve <span className="text-soft">earns while it waits.</span>
          </h2>
          <p className="mt-3 max-w-[460px] text-[14px] leading-relaxed text-secondary">
            Launch a token on a curve backed by a vault Jev watches. The yield stays in the reserve, so the floor price only
            rises, and the same Guardian protects it.
          </p>
        </div>
        <Link
          href={launch.href}
          className="shrink-0 self-start border-b border-ink pb-0.5 text-[13px] font-medium transition-opacity hover:opacity-70 sm:self-auto"
        >
          See Launch →
        </Link>
      </div>
    </section>
  );
}
