import { readVerdicts, writeCache } from '../../shared/cache';
import type { Pool, Verdict } from '../../shared/types';
import { fetchMonadPools } from '../indexer';
import { judgePool, statsHash } from '../judge';

interface RefreshDeps {
  fetchPools?: () => Promise<Pool[]>;
  judge?: (pool: Pool) => Promise<Verdict>;
  concurrency?: number;
}

export async function refreshPools(deps: RefreshDeps = {}): Promise<{ pools: number; judged: number; reused: number }> {
  const concurrency = deps.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Concurrency must be a positive integer');
  // Do not replace the last usable cache if fetching fails.
  const pools = await (deps.fetchPools ?? fetchMonadPools)();
  const previous = await readVerdicts();
  const verdicts: Record<string, Verdict> = {};
  const pending: Pool[] = [];
  let reused = 0;
  for (const pool of pools) {
    const cached = previous[pool.id];
    if (cached && cached.label !== 'NOT_JUDGED' && cached.source !== 'heuristic-placeholder' && cached.statsHash === statsHash(pool)) {
      verdicts[pool.id] = cached;
      reused++;
    } else pending.push(pool);
  }
  let cursor = 0;
  const judge = deps.judge ?? judgePool;
  const run = async () => {
    while (cursor < pending.length) {
      const pool = pending[cursor++];
      verdicts[pool.id] = await judge(pool);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, run));
  await writeCache('verdicts', verdicts);
  await writeCache('pools', { pools, asOf: new Date().toISOString() });
  return { pools: pools.length, judged: pending.length, reused };
}
