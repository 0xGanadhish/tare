import { expect, test } from 'vitest';
import fixture from '@/fixtures/pools.json';
import type { Pool, Verdict } from '@/shared/types';
import { pickAnnotations } from './format';

const base = fixture.pools[1] as Pool;
const pool = (id: string, patch: Partial<Pool>): Pool => ({ ...base, id, ...patch });
const verdict = (p: Pool, label: Verdict['label']): Verdict => ({ poolId: p.id, label, confidence: 0.6, risk: 2, yieldSource: 'organic', band: 'high', flags: [], statsHash: '', judgedAt: '' });

test('the DEPOSIT callout needs at least 1% real yield, so the landing never labels 0.0% "real yield"', () => {
  const dust = pool('dust', { realApy: 0.025, apy: 0.03, tvlUsd: 3_300_000 });
  const real = pool('real', { realApy: 6.5, apy: 7, tvlUsd: 1_000_000 });
  const avoid = pool('avoid', { realApy: 1, apy: 25, tvlUsd: 500_000 });
  const verdicts = { dust: verdict(dust, 'DEPOSIT'), real: verdict(real, 'DEPOSIT'), avoid: verdict(avoid, 'AVOID') };
  expect(pickAnnotations([dust, real, avoid], verdicts)).toEqual(['real', 'avoid']);
  // No DEPOSIT pool with a real yield: annotate only the AVOID one rather than a dust-yield pool.
  expect(pickAnnotations([dust, avoid], verdicts)).toEqual(['avoid']);
});
