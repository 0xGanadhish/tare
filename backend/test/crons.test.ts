import { env } from 'cloudflare:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { abis } from '../../shared/contracts';
import { NETWORKS } from '../../shared/networks';
import type { Pool, Verdict } from '../../shared/types';
import { resolveDue, RESOLVE_WINDOW_S, SAMPLE_WINDOW_S, scanPools, type ResolverDeps } from '../src/crons';
import type { SendRequest, SendResult } from '../src/txSender';

const VAULT = '0x7504b078d1f2b90fb9fcaf3d22753311013ea0ac';

async function seedPost(id: number, postedAt: number, resolved = 0, network: 'testnet' | 'mainnet' = 'testnet', sampled = 0) {
  await env.DB.prepare(`INSERT INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at, resolved, sampled)
    VALUES (?, ?, ?, 1, 9000, 4000, '0x', ?, ?, ?)`).bind(network, id, VAULT, postedAt, resolved, sampled).run();
}

function resolvedLog(id: bigint, adverse: boolean, reasons: number) {
  return {
    address: NETWORKS.testnet.oracle,
    topics: encodeEventTopics({ abi: abis.oracle, eventName: 'VerdictResolved', args: { id } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: 'bool' }, { type: 'uint8' }], [adverse, reasons]),
  };
}

function resolverDeps(onchain: Record<number, { resolved: boolean; adverse: boolean; reasons: number }> = {}) {
  const sent: SendRequest[] = [];
  const deps: ResolverDeps = {
    readResolution: async (_n, id) => onchain[Number(id)] ?? { resolved: false, adverse: false, reasons: 0 },
    sender: () => ({
      send: async (req: SendRequest): Promise<SendResult> => {
        sent.push(req);
        const { args } = decodeFunctionData({ abi: abis.oracle, data: req.data });
        const id = args![0] as bigint;
        return { hash: `0x${'cc'.repeat(32)}`, status: 'success', blockNumber: 1n, gasUsed: 1n, logs: [resolvedLog(id, true, 5)] };
      },
    }),
  };
  return { deps, sent };
}

const NOW = 1_760_000_000;
const rows = async () => (await env.DB.prepare('SELECT id, resolved, adverse, reasons FROM posts ORDER BY id').all()).results;

describe('resolver', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM posts; DELETE FROM pools; DELETE FROM pool_verdicts;'); });

  it('resolveDue picks only posts past their window', async () => {
    await seedPost(1, NOW - RESOLVE_WINDOW_S.testnet - 1); // due
    await seedPost(2, NOW - RESOLVE_WINDOW_S.testnet + 60); // window still open
    await seedPost(3, NOW - RESOLVE_WINDOW_S.testnet - 100, 1); // already resolved in D1
    const { deps, sent } = resolverDeps();
    const result = await resolveDue(env, 'testnet', NOW, deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: NETWORKS.testnet.oracle, kind: 'resolve' });
    expect(result).toEqual({ sampled: 0, sent: 1, synced: 0, failed: 0 });
    expect(await rows()).toEqual([
      { id: 1, resolved: 1, adverse: 1, reasons: 5 },
      { id: 2, resolved: 0, adverse: null, reasons: null },
      { id: 3, resolved: 1, adverse: null, reasons: null },
    ]);
  });

  it('resolveDue syncs already-resolved posts without sending', async () => {
    await seedPost(1, NOW - RESOLVE_WINDOW_S.testnet - 1);
    const { deps, sent } = resolverDeps({ 1: { resolved: true, adverse: false, reasons: 0 } });
    expect(await resolveDue(env, 'testnet', NOW, deps)).toEqual({ sampled: 0, sent: 0, synced: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(await rows()).toEqual([{ id: 1, resolved: 1, adverse: 0, reasons: 0 }]);
  });

  it('resolveDue takes at most 20, oldest first, and one failure does not stop the rest', async () => {
    for (let i = 1; i <= 22; i++) await seedPost(i, NOW - RESOLVE_WINDOW_S.testnet - 1000 + i);
    const { deps } = resolverDeps();
    let calls = 0;
    const flaky: ResolverDeps = { ...deps, readResolution: async (n, id) => { if (calls++ === 0) throw new Error('rpc'); return deps.readResolution(n, id); } };
    const result = await resolveDue(env, 'testnet', NOW, flaky);
    expect(result).toEqual({ sampled: 0, sent: 19, synced: 0, failed: 1 });
    const unresolved = (await rows()).filter((r) => r.resolved === 0).map((r) => r.id);
    expect(unresolved).toEqual([1, 21, 22]);
  });
});

describe('resolver: sampling (spec §2b)', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM posts;'); });
  const RW = RESOLVE_WINDOW_S.mainnet;
  const SW = SAMPLE_WINDOW_S.mainnet;
  const fn = (r: SendRequest) => decodeFunctionData({ abi: abis.oracle, data: r.data });
  const sampledRows = async () => (await env.DB.prepare('SELECT id, sampled, resolved FROM posts ORDER BY id').all()).results;

  it('windows match the deploy: mainnet samples for 1 h after 24 h, testnet does not sample', () => {
    expect(RESOLVE_WINDOW_S).toEqual({ testnet: 3_600, mainnet: 86_400 });
    expect(SAMPLE_WINDOW_S).toEqual({ testnet: 0, mainnet: 3_600 });
  });

  it('mainnet: samples a post once its window opens, and resolves only after sampling closes', async () => {
    await seedPost(1, NOW - RW - 10, 0, 'mainnet'); // sampling open
    await seedPost(2, NOW - RW - SW - 1, 0, 'mainnet', 1); // sampling closed
    await seedPost(3, NOW - RW + 60, 0, 'mainnet'); // still in the resolve window
    const { deps, sent } = resolverDeps();
    const result = await resolveDue(env, 'mainnet', NOW, deps);
    expect(sent.map((r) => [r.kind, fn(r).functionName, fn(r).args![0]])).toEqual([['sample', 'sample', 1n], ['resolve', 'resolve', 2n]]);
    expect(result).toEqual({ sampled: 1, sent: 1, synced: 0, failed: 0 });
    expect(await sampledRows()).toEqual([
      { id: 1, sampled: 1, resolved: 0 },
      { id: 2, sampled: 1, resolved: 1 },
      { id: 3, sampled: 0, resolved: 0 },
    ]);
  });

  it('mainnet: a sampled post is not sampled again', async () => {
    await seedPost(1, NOW - RW - 10, 0, 'mainnet', 1);
    const { deps, sent } = resolverDeps();
    expect(await resolveDue(env, 'mainnet', NOW, deps)).toEqual({ sampled: 0, sent: 0, synced: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it('mainnet: a reverted sample stays unsampled and is retried next minute', async () => {
    await seedPost(1, NOW - RW - 10, 0, 'mainnet');
    const { deps } = resolverDeps();
    const reverting: ResolverDeps = { ...deps, sender: () => ({ send: async () => ({ hash: `0x${'ee'.repeat(32)}`, status: 'reverted', blockNumber: 1n, gasUsed: 1n, logs: [] }) }) };
    expect(await resolveDue(env, 'mainnet', NOW, reverting)).toEqual({ sampled: 0, sent: 0, synced: 0, failed: 1 });
    expect(await sampledRows()).toEqual([{ id: 1, sampled: 0, resolved: 0 }]);
  });

  it('mainnet: a post nobody sampled still resolves after the window (the contract reads once)', async () => {
    await seedPost(1, NOW - RW - SW - 1, 0, 'mainnet');
    const { deps, sent } = resolverDeps();
    expect(await resolveDue(env, 'mainnet', NOW, deps)).toEqual({ sampled: 0, sent: 1, synced: 0, failed: 0 });
    expect(fn(sent[0]).functionName).toBe('resolve');
  });

  it('testnet resolves right after its window, without sampling', async () => {
    await seedPost(1, NOW - RESOLVE_WINDOW_S.testnet - 1);
    const { deps, sent } = resolverDeps();
    await resolveDue(env, 'testnet', NOW, deps);
    expect(sent.map((r) => r.kind)).toEqual(['resolve']);
  });
});

describe('pool scan', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM pools; DELETE FROM pool_verdicts;'); });

  const pool = (id: string, apy: number): Pool => ({
    id, project: 'euler-v2', symbol: 'USDC', assetClass: 'stable', tvlUsd: 1e6, apy, apyBase: apy, apyReward: 0, apyMean30d: null,
    sigma: null, realApy: apy, incentiveShare: 0, apyPct7D: null, ilRisk: false, exposure: 'single', maturity: null, underlying: [], meta: null,
  });
  const verdict = (p: Pool, hash: string): Verdict => ({ poolId: p.id, label: 'DEPOSIT', confidence: 0.9, risk: 2, yieldSource: 'organic', band: 'high', flags: [], statsHash: hash, judgedAt: 'now', source: 'jev' });

  it('scanPools upserts pools and verdicts for mainnet, re-judging only changed pools', async () => {
    const judged: string[] = [];
    const deps = (pools: Pool[]) => ({ fetchPools: async () => pools, judge: async (p: Pool) => { judged.push(p.id); return verdict(p, `h-${p.apy}`); }, hash: (p: Pool) => `h-${p.apy}` });
    expect(await scanPools(env, deps([pool('a', 5), pool('b', 6)]))).toEqual({ pools: 2, judged: 2, reused: 0 });
    expect(await scanPools(env, deps([pool('a', 5), pool('b', 7)]))).toEqual({ pools: 2, judged: 1, reused: 1 });
    expect(judged).toEqual(['a', 'b', 'b']);
    const stored = await env.DB.prepare(`SELECT p.id, json_extract(p.json, '$.apy') AS apy, json_extract(v.json, '$.statsHash') AS hash
      FROM pools p JOIN pool_verdicts v ON v.network = p.network AND v.pool_id = p.id WHERE p.network = 'mainnet' ORDER BY p.id`).all();
    expect(stored.results).toEqual([{ id: 'a', apy: 5, hash: 'h-5' }, { id: 'b', apy: 7, hash: 'h-7' }]);
  });

  it('scanPools keeps the last pools when the fetch fails', async () => {
    await scanPools(env, { fetchPools: async () => [pool('a', 5)], judge: async (p) => verdict(p, 'h'), hash: () => 'h' });
    await expect(scanPools(env, { fetchPools: async () => { throw new Error('llama down'); }, judge: async (p) => verdict(p, 'h'), hash: () => 'h' })).rejects.toThrow('llama down');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pools').first('n')).toBe(1);
  });

  it('scanPools does not cache a NOT_JUDGED verdict as reusable', async () => {
    let n = 0;
    const deps = { fetchPools: async () => [pool('a', 5)], judge: async (p: Pool) => { n++; return { ...verdict(p, 'h'), label: 'NOT_JUDGED' as const }; }, hash: () => 'h' };
    await scanPools(env, deps);
    await scanPools(env, deps);
    expect(n).toBe(2);
  });
});
