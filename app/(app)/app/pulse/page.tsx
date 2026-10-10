import type { Metadata } from 'next';
import { readPools, readVerdicts } from '@/shared/cache';
import { ApyGapBars } from '@/components/pulse/ApyGapBars';
import { AssetClassBars } from '@/components/pulse/AssetClassBars';
import { KpiTiles } from '@/components/pulse/KpiTiles';
import { Movers, type MoverContext } from '@/components/pulse/Movers';
import { ProtocolVerdictBars } from '@/components/pulse/ProtocolVerdictBars';
import { pulseStats } from '@/components/pulse/aggregate';

export const metadata: Metadata = { title: 'Pulse · Tare' };
export const dynamic = 'force-dynamic';

export default async function PulsePage() {
  const [{ pools, asOf }, verdicts] = await Promise.all([readPools(), readVerdicts()]);
  const stats = pulseStats(pools, verdicts);
  const context: Record<string, MoverContext> = {};
  for (const m of stats.movers) {
    const p = pools.find((x) => x.id === m.poolId);
    if (p) context[m.poolId] = { apy: p.apy, label: verdicts[p.id]?.label ?? null };
  }
  const updated = new Date(asOf);

  return (
    <div>
      <header className="mb-8 flex flex-col gap-2 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Market overview</div>
          <h1 className="display mt-2 text-[34px] sm:text-[44px]">Pulse</h1>
        </div>
        <p className="mono text-[11px] text-muted">
          {Number.isNaN(updated.getTime()) ? '' : `DEFILLAMA · ${updated.toISOString().slice(0, 16).replace('T', ' ')} UTC`}
        </p>
      </header>

      <KpiTiles stats={stats} />

      <div className="mt-10 grid gap-x-12 lg:grid-cols-[7fr_5fr]">
        <ApyGapBars rows={stats.byAssetClass} />
        <AssetClassBars rows={stats.byAssetClass} total={stats.tvlTracked} />
        <ProtocolVerdictBars rows={stats.byProtocol} />
        <Movers movers={stats.movers} context={context} />
      </div>
    </div>
  );
}
