import { encodeFunctionData, parseEventLogs, createPublicClient, http } from 'viem';
import { judgePool, statsHash } from '../../lib/judge';
import { fetchMonadPools } from '../../lib/indexer';
import { abis } from '../../shared/contracts';
import { NETWORKS, UNDEPLOYED, type Network } from '../../shared/networks';
import type { Pool, Verdict } from '../../shared/types';
import { RESOLVE_WINDOW_S, SAMPLE_WINDOW_S } from './cadence';
import { rpcFor, type Env } from './env';
import { safeError } from './errors';
import { txSender, type Sender } from './txSender';

export { RESOLVE_WINDOW_S, SAMPLE_WINDOW_S };
const RESOLVE_BATCH = 20;
const SCAN_CONCURRENCY = 4;

export interface ScanDeps { fetchPools(): Promise<Pool[]>; judge(pool: Pool): Promise<Verdict>; hash(pool: Pool): string }
const realScanDeps: ScanDeps = { fetchPools: () => fetchMonadPools(), judge: (p) => judgePool(p), hash: statsHash };

/**
 * Pool scan (plan Task 13): DeFiLlama → Jev → D1, the Workers twin of lib/jobs/refreshPools.
 * Pool data is mainnet data shared by both networks, so it is stored once under 'mainnet'.
 * A failed fetch throws before any write, so the last good scan stays served.
 */
export async function scanPools(env: Env, deps: ScanDeps = realScanDeps): Promise<{ pools: number; judged: number; reused: number }> {
  const pools = await deps.fetchPools();
  const { results } = await env.DB.prepare(`SELECT pool_id, json FROM pool_verdicts WHERE network = 'mainnet'`).all<{ pool_id: string; json: string }>();
  const previous = new Map(results.map((r) => [r.pool_id, JSON.parse(r.json) as Verdict]));
  const verdicts = new Map<string, Verdict>();
  const pending: Pool[] = [];
  for (const pool of pools) {
    const cached = previous.get(pool.id);
    if (cached && cached.label !== 'NOT_JUDGED' && cached.source !== 'heuristic-placeholder' && cached.statsHash === deps.hash(pool)) verdicts.set(pool.id, cached);
    else pending.push(pool);
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const pool = pending[cursor++];
      verdicts.set(pool.id, await deps.judge(pool));
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, pending.length) }, worker));

  const at = new Date().toISOString();
  const statements = pools.flatMap((pool) => {
    const verdict = verdicts.get(pool.id)!;
    return [
      env.DB.prepare(`INSERT INTO pools (network, id, json, updated_at) VALUES ('mainnet', ?, ?, ?)
        ON CONFLICT (network, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`).bind(pool.id, JSON.stringify(pool), at),
      env.DB.prepare(`INSERT INTO pool_verdicts (network, pool_id, json, judged_at) VALUES ('mainnet', ?, ?, ?)
        ON CONFLICT (network, pool_id) DO UPDATE SET json = excluded.json, judged_at = excluded.judged_at`).bind(pool.id, JSON.stringify(verdict), verdict.judgedAt),
    ];
  });
  if (statements.length) await env.DB.batch(statements);
  const summary = { pools: pools.length, judged: pending.length, reused: pools.length - pending.length };
  console.log(JSON.stringify({ msg: 'pool_scan', ...summary }));
  return summary;
}

export interface ResolverDeps {
  readResolution(network: Network, id: bigint): Promise<{ resolved: boolean; adverse: boolean; reasons: number }>;
  sender(network: Network): Sender;
}

export function realResolverDeps(env: Env): ResolverDeps {
  return {
    async readResolution(network, id) {
      const client = createPublicClient({ chain: NETWORKS[network].chain, transport: http(rpcFor(env, network), { retryCount: 2 }) });
      const r = await client.readContract({ address: NETWORKS[network].oracle, abi: abis.oracle, functionName: 'getResolution', args: [id] });
      return { resolved: r.resolved, adverse: r.adverse, reasons: r.reasons };
    },
    sender: (network) => txSender(env, network, 'executor'),
  };
}

/**
 * Resolver (plan Task 13, spec §2b): grade every post whose windows have ended, oldest first. Where the network has a
 * sampling window, it first sends one sample() per post as soon as that window opens: one honest reading caps the
 * grade, so a flash loan around someone else's sample or resolve can't flatter it. Anyone may call resolve(), so posts
 * someone else already graded are synced from chain instead of sent again.
 */
export async function resolveDue(env: Env, network: Network, now: number, deps: ResolverDeps = realResolverDeps(env)): Promise<{ sampled: number; sent: number; synced: number; failed: number }> {
  const tally = { sampled: 0, sent: 0, synced: 0, failed: 0 };
  const opensAfter = RESOLVE_WINDOW_S[network];
  const closesAfter = opensAfter + SAMPLE_WINDOW_S[network];

  if (SAMPLE_WINDOW_S[network] > 0) {
    const { results } = await env.DB.prepare(`SELECT id FROM posts WHERE network = ? AND resolved = 0 AND sampled = 0 AND posted_at + ? <= ? AND posted_at + ? > ? ORDER BY posted_at, id LIMIT ?`)
      .bind(network, opensAfter, now, closesAfter, now, RESOLVE_BATCH).all<{ id: number }>();
    for (const { id } of results) {
      try {
        const receipt = await deps.sender(network).send({
          to: NETWORKS[network].oracle, kind: 'sample',
          data: encodeFunctionData({ abi: abis.oracle, functionName: 'sample', args: [BigInt(id)] }),
        });
        if (receipt.status !== 'success') throw new Error(`sample reverted (${receipt.hash})`);
        await env.DB.prepare('UPDATE posts SET sampled = 1 WHERE network = ? AND id = ?').bind(network, id).run();
        tally.sampled++;
        console.log(JSON.stringify({ msg: 'verdict_sampled', network, verdictId: id, txHash: receipt.hash }));
      } catch (err) {
        tally.failed++;
        console.error(JSON.stringify({ msg: 'sample_failed', network, verdictId: id, error: safeError(err) }));
      }
    }
  }

  const { results } = await env.DB.prepare(`SELECT id FROM posts WHERE network = ? AND resolved = 0 AND posted_at + ? <= ? ORDER BY posted_at, id LIMIT ?`)
    .bind(network, closesAfter, now, RESOLVE_BATCH).all<{ id: number }>();
  const save = (id: number, adverse: boolean, reasons: number) => env.DB.prepare('UPDATE posts SET resolved = 1, adverse = ?, reasons = ? WHERE network = ? AND id = ?')
    .bind(adverse ? 1 : 0, reasons, network, id).run();
  for (const { id } of results) {
    try {
      const onchain = await deps.readResolution(network, BigInt(id));
      if (onchain.resolved) {
        await save(id, onchain.adverse, onchain.reasons);
        tally.synced++;
        continue;
      }
      const receipt = await deps.sender(network).send({
        to: NETWORKS[network].oracle, kind: 'resolve',
        data: encodeFunctionData({ abi: abis.oracle, functionName: 'resolve', args: [BigInt(id)] }),
      });
      if (receipt.status !== 'success') throw new Error(`resolve reverted (${receipt.hash})`);
      const event = parseEventLogs({ abi: abis.oracle, eventName: 'VerdictResolved', logs: receipt.logs as never }).find((e) => e.args.id === BigInt(id));
      if (!event) throw new Error(`no VerdictResolved for ${id} in ${receipt.hash}`);
      await save(id, event.args.adverse, event.args.reasons);
      tally.sent++;
      console.log(JSON.stringify({ msg: 'verdict_resolved', network, verdictId: id, adverse: event.args.adverse, reasons: event.args.reasons, txHash: receipt.hash }));
    } catch (err) {
      tally.failed++;
      console.error(JSON.stringify({ msg: 'resolve_failed', network, verdictId: id, error: safeError(err) }));
    }
  }
  return tally;
}

/** Networks whose oracle is deployed; the others have nothing to resolve or watch yet. */
export const liveNetworks = (): Network[] => (['testnet', 'mainnet'] as const).filter((n) => NETWORKS[n].oracle !== UNDEPLOYED);
