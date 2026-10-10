import { readFileSync } from 'node:fs';
import type { Pool, VerdictLabel } from '../shared/types';
import { jev } from '../lib/jev';
import { judgePool, poolQuestions } from '../lib/judge';
import { renderPoolState } from '../lib/judge/state';

async function main(): Promise<void> {
  if (!process.env.TYPESAFE_API_KEY) {
    console.log('SKIP: TYPESAFE_API_KEY is missing; live Jev calibration was not run.');
    return;
  }
  const { pools } = JSON.parse(readFileSync('fixtures/pools.json', 'utf8')) as { pools: Pool[] };
  // Explicit golden cases, independent of fixture ordering. Emissions alone do not prove
  // unsustainability; a tiny but organic base yield is a ranking issue, not an automatic veto.
  const cases: { project: string; symbol: string; expected: VerdictLabel }[] = [
    { project: 'aave-v3', symbol: 'SYRUPUSDC', expected: 'CONSIDER' },
    { project: 'aave-v3', symbol: 'USDE', expected: 'AVOID' },
    { project: 'accountable', symbol: 'AUSD', expected: 'DEPOSIT' },
    { project: 'townsquare-lending', symbol: 'ENZOBTC', expected: 'DEPOSIT' },
    { project: 'accountable', symbol: 'USDC', expected: 'CONSIDER' },
  ];
  const golden = cases.map(({ project, symbol, expected }) => {
    const pool = pools.find((p) => p.project === project && p.symbol === symbol);
    if (!pool) throw new Error(`Golden calibration pool missing: ${project} ${symbol}`);
    return { pool, expected };
  });
  const accountable = golden[2].pool;
  const probe = await jev(renderPoolState(accountable), poolQuestions);
  console.log('Live Score response:', JSON.stringify(probe.risk));
  let disagreements = 0;
  for (const { pool, expected } of golden) {
    console.log(`Facts: incentiveShare=${pool.incentiveShare} tvlUsd=${pool.tvlUsd} apyBase=${pool.apyBase}`);
    const verdict = await judgePool(pool);
    console.log(`${pool.project} ${pool.symbol}: ${verdict.label} confidence=${verdict.confidence} risk=${verdict.risk}; expected=${expected}`);
    if (verdict.label === 'NOT_JUDGED') throw new Error('Live Jev failed during calibration');
    if (verdict.label !== expected) disagreements++;
  }
  console.log(`Calibration disagreements: ${disagreements}/5`);
  if (disagreements >= 2) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
