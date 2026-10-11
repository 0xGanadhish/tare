import type { Network } from '../shared/networks';
import type { Address, Pool, Verdict } from '../shared/types';

/** One row of `posts` as the backend serves it (backend/src/api.ts `toVerdict`). `verdict` is the oracle enum: 0 HOLD, 1 EXIT, 2 MOVE. */
export interface LedgerVerdict {
  network: Network; id: number; vault: Address; verdict: number; confidenceBps: number; riskBps: number;
  stateHash: `0x${string}`; postedAt: number; txHash: `0x${string}` | null;
  resolved: boolean; adverse: boolean | null; reasons: number | null; drill: boolean;
}

/** One row of `events` (Watch feed). `type` follows the v1 WatchEvent types plus `exit_partial`. */
export interface BackendEvent {
  id: string; network: Network; owner: Address; vault: Address; type: string; message: string;
  txHash: `0x${string}` | null; confidence: number | null; at: string;
}

export interface LedgerScore {
  n: number; brier: number | null; early: boolean;
  bands: { band: '80-89' | '90-94' | '95-100' | '<80'; n: number; hitRate: number | null }[];
}

export interface Market { pools: Pool[]; verdicts: Record<string, Verdict>; asOf: string | null }

/** The backend could not answer (network error or non-2xx). Callers fall back or show "unavailable". */
export class BackendUnavailable extends Error {
  constructor(readonly path: string, readonly status: number | null, cause?: unknown) {
    super(`Backend unavailable: ${path}${status ? ` (${status})` : ''}`, { cause });
    this.name = 'BackendUnavailable';
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** Typed client for the Cloudflare backend read API (plan Task 8). */
export function createBackend(baseUrl: string, fetchFn: FetchFn = (url, init) => fetch(url, init)) {
  const base = baseUrl.replace(/\/+$/, '');
  async function get<T>(path: string, opts: { nullOn404?: boolean } = {}): Promise<T | null> {
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
    } catch (err) {
      throw new BackendUnavailable(path, null, err);
    }
    if (res.status === 404 && opts.nullOn404) return null;
    if (!res.ok) throw new BackendUnavailable(path, res.status);
    return (await res.json()) as T;
  }
  const must = async <T>(path: string) => (await get<T>(path)) as T;

  return {
    pools: () => must<Market>('/v1/pools'),
    pool: (id: string) => get<{ pool: Pool; verdict: Verdict | null }>(`/v1/pools/${encodeURIComponent(id)}`, { nullOn404: true }),
    verdicts: (p: { network: Network; vault?: string; cursor?: string; limit?: number }) =>
      must<{ verdicts: LedgerVerdict[]; cursor: string | null }>(`/v1/verdicts${query({ network: p.network, vault: p.vault, cursor: p.cursor, limit: p.limit })}`),
    latest: async (network: Network, vault: string) =>
      (await get<{ verdict: LedgerVerdict }>(`/v1/vaults/${network}/${vault}/latest`, { nullOn404: true }))?.verdict ?? null,
    events: async (network: Network, owner: string, since?: string) =>
      (await must<{ events: BackendEvent[] }>(`/v1/events/${network}/${owner}${query({ since })}`)).events,
    score: (network: Network) => must<LedgerScore>(`/v1/ledger/score${query({ network })}`),
  };
}

export type Backend = ReturnType<typeof createBackend>;

/** Server-side client from BACKEND_URL, or null when no backend is configured. */
export function serverBackend(): Backend | null {
  const url = process.env.BACKEND_URL;
  return url ? createBackend(url) : null;
}
