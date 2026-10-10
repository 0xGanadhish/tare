import Link from 'next/link';
import { formatPct, formatTvl } from '@/components/field/format';
import type { PulseStats } from './aggregate';
import { ASSET_CLASS_LABEL, exploreHref } from './labels';
import { Section } from './Section';

/** TVL by asset class: single-hue (ink) bars sorted by size, share of total beside each value. */
export function AssetClassBars({ rows, total }: { rows: PulseStats['byAssetClass']; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.tvl));
  return (
    <Section eyebrow="Where the money sits" title="TVL by asset class" note="Share of all tracked liquidity.">
      <ul className="space-y-1">
        {rows.map((r) => {
          const name = ASSET_CLASS_LABEL[r.assetClass];
          const share = total > 0 ? (r.tvl / total) * 100 : 0;
          return (
            <li key={r.assetClass}>
              <Link
                href={exploreHref({ assetClass: r.assetClass })}
                title={`${name}: ${formatTvl(r.tvl)} (${formatPct(share)} of TVL)`}
                className="group -mx-2 block rounded-[3px] px-2 py-2.5 transition-colors hover:bg-paper focus-visible:bg-paper"
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px]">{name}</span>
                  <span className="mono text-[11px] text-muted">{formatPct(share, share < 10 ? 1 : 0)}</span>
                </div>
                <div className="flex h-[14px] items-center gap-2">
                  <div className="relative h-full flex-1">
                    <div
                      className="absolute inset-y-0 left-0 rounded-r-[4px] bg-ink transition-opacity group-hover:opacity-80"
                      style={{ width: `${(r.tvl / max) * 100}%`, minWidth: 2 }}
                    />
                  </div>
                  <span className="mono w-[58px] shrink-0 text-right text-[11px] text-secondary">{formatTvl(r.tvl)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
