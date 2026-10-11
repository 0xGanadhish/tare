import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPools, readVerdicts } from '../shared/cache';
import type { Intent, Pool, Verdict } from '../shared/types';
import { BackendUnavailable, serverBackend } from './backend';

/** Market data: fixtures when offline or DATA_SOURCE=fixtures, else the backend (BACKEND_URL; throws BackendUnavailable when it can't answer), else the local worker cache. */
export async function readMarket(): Promise<{ pools: Pool[]; verdicts: Record<string, Verdict>; asOf: string }> {
  if (process.env.OFFLINE === '1') {
    const dir = process.env.FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
    const [pools, verdicts] = await Promise.all([
      readFile(join(dir, 'pools.json'), 'utf8'), readFile(join(dir, 'verdicts.json'), 'utf8'),
    ]);
    return { ...JSON.parse(pools), verdicts: JSON.parse(verdicts) };
  }
  const backend = process.env.DATA_SOURCE === 'fixtures' ? null : serverBackend();
  if (backend) {
    // With a backend configured, its answer is the only live source: falling back here could show fixture pools as live.
    const market = await backend.pools();
    if (!market.asOf) throw new BackendUnavailable('/v1/pools', null, new Error('backend has no pool scan yet'));
    return { pools: market.pools, verdicts: market.verdicts, asOf: market.asOf };
  }
  const [market, verdicts] = await Promise.all([readPools(), readVerdicts()]);
  return { ...market, verdicts };
}

export function isIntent(value: unknown): value is Intent {
  if (!value || typeof value !== 'object') return false;
  const intent = value as Partial<Intent>;
  const choice = (value: unknown, options: string[]) => {
    if (!value || typeof value !== 'object') return false;
    const c = value as { value?: unknown; confidence?: unknown };
    return typeof c.value === 'string' && options.includes(c.value) && typeof c.confidence === 'number'
      && Number.isFinite(c.confidence) && c.confidence >= 0 && c.confidence <= 1;
  };
  return typeof intent.text === 'string' && (intent.asset === null || typeof intent.asset === 'string')
    && (intent.amount === null || (typeof intent.amount === 'number' && Number.isFinite(intent.amount) && intent.amount >= 0))
    && choice(intent.risk, ['low', 'medium', 'high']) && choice(intent.horizon, ['short', 'medium', 'long'])
    && choice(intent.assetPref, ['stable', 'gold', 'rwa', 'mon', 'btc_eth', 'other', 'any']);
}
