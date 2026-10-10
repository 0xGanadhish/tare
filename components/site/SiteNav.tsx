import Link from 'next/link';
import { SITE_NAV, visibleNav } from '@/components/ui/navItems';
import { Wordmark } from '@/components/ui/Wordmark';

export function SiteNav() {
  return (
    <nav className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-5 text-[12.5px] sm:px-9">
      <Wordmark />
      <div className="hidden gap-6 text-secondary sm:flex">
        {visibleNav(SITE_NAV).map((n) => (
          <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
            {n.label}
          </Link>
        ))}
      </div>
      <Link href="/app/explore" className="font-medium transition-opacity hover:opacity-70">
        Open app ↗
      </Link>
    </nav>
  );
}
