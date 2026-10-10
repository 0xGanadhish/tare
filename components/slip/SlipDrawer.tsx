'use client';

import { useEffect, useState } from 'react';
import type { Pool, Verdict } from '@/shared/types';
import { VerdictSlip } from './VerdictSlip';

type History = { t: string; apy: number; tvlUsd: number }[];

export interface SlipDrawerProps {
  /** Pool shown immediately from the list; history is fetched from /api/pools/[id]. */
  pool: Pool | null;
  verdict?: Verdict;
  onClose: () => void;
}

/** Right-hand drawer (bottom sheet on phones) with the verdict slip and the 90-day APY sparkline. */
export function SlipDrawer({ pool, verdict, onClose }: SlipDrawerProps) {
  const [history, setHistory] = useState<{ id: string; rows: History } | null>(null);
  const id = pool?.id;

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/api/pools/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { history?: History } | null) => {
        if (live && j?.history) setHistory({ id, rows: j.history });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  if (!pool) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Verdict slip">
      <button aria-label="Close" className="absolute inset-0 cursor-default bg-ink/25" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-bg p-4 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px] sm:max-h-none sm:rounded-none sm:p-6">
        <div className="mb-3 flex justify-end">
          <button onClick={onClose} className="mono text-[11px] uppercase tracking-[0.06em] text-secondary hover:text-ink">
            Close ✕
          </button>
        </div>
        <VerdictSlip pool={pool} verdict={verdict} history={history?.id === pool.id ? history.rows : undefined} />
      </div>
    </div>
  );
}
