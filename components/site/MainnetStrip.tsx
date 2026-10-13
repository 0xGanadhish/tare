import Link from 'next/link';
import { NETWORKS, type VaultConfig } from '@/shared/networks';
import type { Pool } from '@/shared/types';
import { addressUrl } from '@/components/tx/explorer';
import { formatTvl } from '@/components/field/format';

const VENUE: Record<VaultConfig['protocol'], string> = { euler: 'Euler Earn', morpho: 'Morpho V2', mirror: 'Mirror' };

/** What is live on Monad mainnet: the watched vaults (TVL from the same pool feed as the chart) and the verified contracts. */
export function MainnetStrip({ pools }: { pools: Pool[] }) {
  const { vaults, oracle, guardian } = NETWORKS.mainnet;
  const tvls = vaults.map((v) => pools.find((p) => p.id === v.poolId)?.tvlUsd);
  const tvl = tvls.every((t) => t !== undefined) ? tvls.reduce<number>((sum, t) => sum + t!, 0) : null;
  const linkCls = 'border-b border-hairline pb-0.5 transition-opacity hover:opacity-70';

  return (
    <section className="mx-auto mt-16 w-full max-w-[1200px] px-5 sm:mt-20 sm:px-9" aria-label="Live on Monad mainnet">
      <div className="flex flex-col gap-4 border-y border-hairline py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="mono flex items-center gap-2 text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <i className="inline-block size-1.5 rounded-full bg-deposit" aria-hidden />
            Live on Monad mainnet
          </div>
          <p className="text-[14px] leading-relaxed text-secondary">
            {vaults.map((v, i) => (
              <span key={v.address}>
                {i > 0 && ' and '}
                <span className="text-ink">{v.name}</span> <span className="text-muted">({VENUE[v.protocol]})</span>
              </span>
            ))}
            {tvl !== null && <span className="text-muted"> · {formatTvl(tvl)} TVL</span>}
          </p>
        </div>
        <div className="mono flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-secondary">
          <a href={addressUrl(oracle, 'mainnet')} target="_blank" rel="noreferrer" className={linkCls}>
            Oracle ✓ verified
          </a>
          <a href={addressUrl(guardian, 'mainnet')} target="_blank" rel="noreferrer" className={linkCls}>
            GuardianV2 ✓ verified
          </a>
          <Link href="/app/ledger?network=mainnet" className={linkCls}>
            Mainnet Ledger →
          </Link>
          <Link href="/app/docs#for-developers" className={linkCls}>
            For developers →
          </Link>
        </div>
      </div>
    </section>
  );
}
