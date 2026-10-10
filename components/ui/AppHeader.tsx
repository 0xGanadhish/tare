'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV, visibleNav } from './navItems';
import { Wordmark } from './Wordmark';
import { WalletButton } from './WalletButton';
import { FaucetButton } from './FaucetButton';

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-9">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="mono hidden rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted sm:inline">
            Monad testnet
          </span>
        </div>
        <nav aria-label="App" className="hidden items-center gap-6 text-[12.5px] md:flex">
          {visibleNav(APP_NAV).map((n) => (
            <NavLink key={n.href} {...n} active={pathname.startsWith(n.href)} />
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <FaucetButton />
          <WalletButton />
        </div>
      </div>
      <nav aria-label="App" className="mx-auto flex w-full max-w-[1200px] gap-5 overflow-x-auto px-4 pb-2.5 text-[12.5px] md:hidden">
        {visibleNav(APP_NAV).map((n) => (
          <NavLink key={n.href} {...n} active={pathname.startsWith(n.href)} />
        ))}
      </nav>
    </header>
  );
}

function NavLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 border-b pb-0.5 transition-colors ${active ? 'border-ink text-ink' : 'border-transparent text-secondary hover:text-ink'}`}
    >
      {label}
    </Link>
  );
}
