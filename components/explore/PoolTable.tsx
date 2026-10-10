'use client';

import { useMemo, useState } from 'react';
import type { Pool, Verdict, VerdictLabel } from '@/shared/types';
import { formatConfidence, formatPct, formatPoolName, formatTvl } from '@/components/field/format';

type SortKey = 'name' | 'tvl' | 'apy' | 'real' | 'verdict';

const DOT: Record<VerdictLabel, string> = {
  DEPOSIT: 'bg-deposit',
  AVOID: 'bg-avoid',
  CONSIDER: 'border border-consider bg-transparent',
  NOT_JUDGED: 'border border-faint bg-transparent',
};
const ORDER: Record<VerdictLabel, number> = { DEPOSIT: 0, CONSIDER: 1, AVOID: 2, NOT_JUDGED: 3 };

export interface PoolTableProps {
  pools: Pool[];
  verdicts: Record<string, Verdict>;
  onSelect: (poolId: string) => void;
}

export function PoolTable({ pools, verdicts, onSelect }: PoolTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'tvl', dir: -1 });
  const rows = useMemo(() => {
    const val = (p: Pool): number | string => {
      switch (sort.key) {
        case 'name': return formatPoolName(p).toLowerCase();
        case 'tvl': return p.tvlUsd;
        case 'apy': return p.apy;
        case 'real': return p.realApy;
        case 'verdict': return ORDER[verdicts[p.id]?.label ?? 'NOT_JUDGED'];
      }
    };
    return [...pools].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [pools, verdicts, sort]);

  const head = (key: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' || key === 'verdict' ? 1 : -1 }))}
        className={`mono text-[10.5px] uppercase tracking-[0.06em] hover:text-ink ${sort.key === key ? 'text-ink' : 'text-muted'}`}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? ' ↑' : ' ↓')}
      </button>
    </th>
  );

  if (!pools.length) return <p className="py-10 text-center text-[13px] text-muted">No pools match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="border-b border-hairline">
          <tr>
            {head('name', 'Pool')}
            {head('verdict', 'Verdict')}
            {head('apy', 'APY', true)}
            {head('real', 'Real APY', true)}
            {head('tvl', 'TVL', true)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const v = verdicts[p.id];
            const label = v?.label ?? 'NOT_JUDGED';
            return (
              <tr
                key={p.id}
                tabIndex={0}
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p.id))}
                className="cursor-pointer border-b border-hairline/70 hover:bg-white/60 focus:bg-white/60 focus:outline-none"
              >
                <td className="py-2.5 pr-3">{formatPoolName(p)}</td>
                <td className="py-2.5 pr-3">
                  <span className="mono inline-flex items-center gap-2 text-[11px] text-secondary">
                    <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[label]}`} />
                    {label === 'NOT_JUDGED' ? 'Not judged' : `${label} ${formatConfidence(v!.confidence)}`}
                  </span>
                </td>
                <td className="mono py-2.5 text-right tabular-nums text-secondary">{formatPct(p.apy)}</td>
                <td className="mono py-2.5 text-right tabular-nums">{formatPct(p.realApy)}</td>
                <td className="mono py-2.5 text-right tabular-nums text-secondary">{formatTvl(p.tvlUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
