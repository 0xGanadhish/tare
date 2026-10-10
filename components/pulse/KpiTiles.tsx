import Link from 'next/link';
import { formatPct, formatTvl } from '@/components/field/format';
import type { PulseStats } from './aggregate';

export function KpiTiles({ stats }: { stats: PulseStats }) {
  const tiles = [
    { label: 'TVL tracked', value: formatTvl(stats.tvlTracked), hint: `across ${stats.poolCount} pools`, href: '/app/explore' },
    { label: 'Pools weighed', value: String(stats.poolCount), hint: 'each with a Jev verdict', href: '/app/explore' },
    { label: 'Protocols', value: String(stats.protocolCount), hint: 'live on Monad', href: '/app/explore' },
    { label: 'Median real APY', value: formatPct(stats.medianRealApy), hint: 'after stripping emissions', href: '/app/explore' },
    {
      label: 'TVL in emission-heavy pools',
      value: formatPct(stats.emissionHeavyTvlShare * 100, 0),
      hint: 'over half the APY is incentives',
      href: '/app/explore',
    },
  ];
  return (
    <ul className="grid grid-cols-2 border-y border-hairline lg:grid-cols-5">
      {tiles.map((t, i) => (
        <li
          key={t.label}
          className={`border-hairline ${i % 2 === 1 ? 'border-l' : ''} ${i > 1 ? 'border-t' : ''} ${i === 4 ? 'col-span-2 border-l-0' : ''} lg:col-span-1 lg:border-t-0 ${i > 0 ? 'lg:border-l' : 'lg:border-l-0'}`}
        >
          <Link
            href={t.href}
            className="group block px-4 py-5 transition-colors hover:bg-paper sm:px-6 sm:py-6 lg:first:pl-0"
          >
            <div className="mono flex items-start justify-between gap-2 text-[10.5px] uppercase leading-snug tracking-[0.06em] text-muted">
              <span>{t.label}</span>
              <span aria-hidden className="text-faint transition-colors group-hover:text-ink">↗</span>
            </div>
            <div className="mono mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] sm:text-[34px]">{t.value}</div>
            <div className="mt-2.5 text-[12px] leading-snug text-secondary">{t.hint}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
