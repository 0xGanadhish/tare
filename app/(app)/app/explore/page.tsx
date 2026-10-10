'use client';

import { useCallback, useMemo, useState } from 'react';
import { FieldChart } from '@/components/field/FieldChart';
import { fieldStats, formatProject, formatTvl } from '@/components/field/format';
import { PoolTable } from '@/components/explore/PoolTable';
import { asOfLabel, usePools } from '@/components/explore/usePools';
import { SlipDrawer } from '@/components/slip/SlipDrawer';
import type { AssetClass } from '@/shared/types';

const TABS: { id: AssetClass | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stable', label: 'Stable' },
  { id: 'gold', label: 'Gold' },
  { id: 'rwa', label: 'RWA' },
  { id: 'mon', label: 'MON' },
  { id: 'btc_eth', label: 'BTC/ETH' },
];

export default function ExplorePage() {
  const { data, error } = usePools();
  const [tab, setTab] = useState<AssetClass | 'all'>('all');
  const [protocol, setProtocol] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);

  const protocols = useMemo(() => [...new Set((data?.pools ?? []).map((p) => p.project))].sort(), [data]);
  const pools = useMemo(
    () => (data?.pools ?? []).filter((p) => (tab === 'all' || p.assetClass === tab) && (protocol === 'all' || p.project === protocol)),
    [data, tab, protocol],
  );
  const stats = fieldStats(pools);
  const selectedPool = data?.pools.find((p) => p.id === selected) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[30px] sm:text-[38px]">Explore</h1>
          <p className="mt-1 text-[14px] text-secondary">Every pool, weighed by Jev. Click a dot or a row for the verdict slip.</p>
        </div>
        <span className="mono text-[11px] uppercase tracking-[0.06em] text-muted">data as of {data ? asOfLabel(data.asOf) : '–'}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="tablist" aria-label="Asset class" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition ${tab === t.id ? 'border-ink bg-ink text-white' : 'border-hairline bg-white text-secondary hover:border-ink/40'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-secondary">
          <span className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Protocol</span>
          <span className="relative inline-flex">
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className={`cursor-pointer appearance-none rounded-full border py-1.5 pl-3.5 pr-8 text-[12px] leading-[1.5] outline-none transition hover:border-ink/40 focus-visible:border-ink ${protocol === 'all' ? 'border-hairline bg-white text-secondary' : 'border-ink bg-ink text-white'}`}
            >
              <option value="all">All protocols</option>
              {protocols.map((p) => (
                <option key={p} value={p}>
                  {formatProject(p)}
                </option>
              ))}
            </select>
            <svg aria-hidden viewBox="0 0 12 12" className={`pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 ${protocol === 'all' ? 'text-muted' : 'text-white'}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-8 rounded-xl border border-avoid/40 bg-white p-4 text-[13px] text-avoid">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-8 text-[13px] text-muted">Loading pools…</p>}
      {data && (
        <>
          <div className="mt-6">
            <FieldChart pools={pools} verdicts={data.verdicts} onSelect={setSelected} />
            <p className="mono mt-2 text-[10.5px] uppercase tracking-[0.06em] text-muted">
              {stats.pools} pools · {stats.protocols} protocols · {formatTvl(stats.tvlUsd)} · x = APY · y = TVL
            </p>
          </div>
          <div className="mt-8">
            <PoolTable pools={pools} verdicts={data.verdicts} onSelect={setSelected} />
          </div>
        </>
      )}
      <SlipDrawer pool={selectedPool} verdict={selectedPool ? data?.verdicts[selectedPool.id] : undefined} onClose={close} />
    </div>
  );
}
