interface HistoryPoint { t: string; apy: number; tvlUsd: number }
const histories = new Map<string, { at: number; points: HistoryPoint[] }>();
const HOUR = 3_600_000;
const NINETY_DAYS = 90 * 86_400_000;

export async function readHistory(poolId: string): Promise<HistoryPoint[]> {
  const cached = histories.get(poolId);
  let points = cached?.points ?? [];
  if (process.env.OFFLINE !== '1' && (!cached || Date.now() - cached.at >= HOUR)) {
    try {
      const response = await fetch(`https://yields.llama.fi/chart/${encodeURIComponent(poolId)}`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
      if (!response.ok) throw new Error(`DeFiLlama chart HTTP ${response.status}`);
      const body = await response.json() as { data?: { timestamp?: unknown; apy?: unknown; tvlUsd?: unknown }[] };
      if (!Array.isArray(body.data)) throw new Error('Malformed chart');
      points = body.data.map((row) => {
        const timestamp = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
        const apy = row.apy ?? 0;
        if (!Number.isFinite(timestamp) || typeof apy !== 'number' || !Number.isFinite(apy)
          || typeof row.tvlUsd !== 'number' || !Number.isFinite(row.tvlUsd) || row.tvlUsd < 0) throw new Error('Malformed chart row');
        return { t: new Date(timestamp).toISOString(), apy, tvlUsd: row.tvlUsd };
      });
      histories.set(poolId, { at: Date.now(), points });
    } catch {
      points = cached?.points ?? [];
    }
  }
  const cutoff = Date.now() - NINETY_DAYS;
  return points.filter((point) => Date.parse(point.t) >= cutoff && Date.parse(point.t) <= Date.now());
}
