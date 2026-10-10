'use client';

import { useEffect, useState } from 'react';
import type { Pool, Verdict } from '@/shared/types';

export interface PoolsData {
  pools: Pool[];
  verdicts: Record<string, Verdict>;
  asOf: string;
}

/** GET /api/pools once; `error` is shown instead of fabricated data (spec §10). */
export function usePools(): { data: PoolsData | null; error: string | null } {
  const [state, setState] = useState<{ data: PoolsData | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    fetch('/api/pools')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Pools unavailable (${r.status})`);
        return (await r.json()) as PoolsData;
      })
      .then((data) => live && setState({ data, error: null }))
      .catch((e: unknown) => live && setState({ data: null, error: e instanceof Error ? e.message : 'Pools unavailable' }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function asOfLabel(asOf: string): string {
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
