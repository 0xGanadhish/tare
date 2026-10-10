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
  const emission = pools.filter((p) => p.incentiveShare >= 0.9).slice(0, 2);
  const accountable = pools.find((p) => p.project === 'accountable' && p.symbol === 'AUSD');
  if (!accountable || emission.length < 2) throw new Error('Golden calibration pools are missing');
  const others = pools.filter((p) => p.id !== accountable.id && !emission.some((e) => e.id === p.id)).slice(0, 2);
  const golden: { pool: Pool; expected: VerdictLabel }[] = [
    ...emission.map((pool) => ({ pool, expected: 'AVOID' as const })),
    { pool: accountable, expected: 'DEPOSIT' },
    ...others.map((pool) => ({ pool, expected: 'CONSIDER' as const })),
  ];
  const probe = await jev(renderPoolState(accountable), poolQuestions);
  console.log('Live Score response:', JSON.stringify(probe.risk));
  let disagreements = 0;
  for (const { pool, expected } of golden) {
    const verdict = await judgePool(pool);
    console.log(`${pool.project} ${pool.symbol}: ${verdict.label} confidence=${verdict.confidence} risk=${verdict.risk}; expected=${expected}`);
    if (verdict.label === 'NOT_JUDGED') throw new Error('Live Jev failed during calibration');
    if (verdict.label !== expected) disagreements++;
  }
  console.log(`Calibration disagreements: ${disagreements}/5`);
  if (disagreements >= 2) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
