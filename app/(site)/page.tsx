import { readLandingMarket } from '@/lib/api';
import { FieldChart } from '@/components/field/FieldChart';
import { fieldStats, formatTvl, pickAnnotations } from '@/components/field/format';
import { VERDICT_COLORS } from '@/components/field/scales';
import { SiteNav } from '@/components/site/SiteNav';
import { ScanInput } from '@/components/site/ScanInput';
import { Steps } from '@/components/site/Steps';
import { LaunchTeaser } from '@/components/site/LaunchTeaser';
import { MainnetStrip } from '@/components/site/MainnetStrip';
import { SiteFooter } from '@/components/site/SiteFooter';

export const dynamic = 'force-dynamic';

const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.toISOString().slice(11, 16)} UTC`;
};

export default async function Landing() {
  const { pools, verdicts, asOf, live } = await readLandingMarket();
  const stats = fieldStats(pools);
  const annotate = pickAnnotations(pools, verdicts);

  return (
    <div className="min-h-screen bg-bg">
      <SiteNav />

      <header className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pt-6 sm:px-9 sm:pt-8 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="display max-w-[520px] text-[34px] sm:text-[44px]">
          Every yield on Monad, weighed. <span className="text-soft">A public, graded risk feed, and a Guardian that acts on it.</span>
        </h1>
        <ScanInput />
      </header>

      <section className="mx-auto mt-6 w-full max-w-[1200px] px-3 sm:px-9" aria-label="Every Monad pool, judged">
        <FieldChart pools={pools} verdicts={verdicts} annotate={annotate} animate />
        <div className="mono mt-2 flex flex-col gap-2 px-2 text-[10.5px] tracking-[0.02em] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <div className="flex gap-4">
            <span>
              <i className="mr-1.5 inline-block size-2 rounded-full align-[-1px]" style={{ background: VERDICT_COLORS.DEPOSIT }} />
              Deposit
            </span>
            <span>
              <i
                className="mr-1.5 inline-block size-2 rounded-full align-[-1px]"
                style={{ border: `1.5px solid ${VERDICT_COLORS.CONSIDER_RING}` }}
              />
              Consider
            </span>
            <span>
              <i className="mr-1.5 inline-block size-2 rounded-full align-[-1px]" style={{ background: VERDICT_COLORS.AVOID }} />
              Avoid
            </span>
          </div>
          <div className="uppercase">
            {stats.pools} pools · {stats.protocols} protocols · {formatTvl(stats.tvlUsd)} · X = APY · Y = TVL
          </div>
        </div>
        <p className="mono mt-1 hidden px-2 text-[10px] text-faint sm:block sm:px-0">
          {live ? `Data as of ${stamp(asOf)}` : `Snapshot from ${stamp(asOf)}, live feed unavailable`} · hover a dot to see Jev&apos;s verdict
        </p>
      </section>

      <MainnetStrip pools={pools} />
      <Steps />
      <LaunchTeaser />
      <SiteFooter />
    </div>
  );
}
