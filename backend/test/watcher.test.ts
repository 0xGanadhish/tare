import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { JevUnavailable } from '../../lib/jev';
import type { DetailedPositionJudgment } from '../../lib/judge';
import { NETWORKS } from '../../shared/networks';
import type { ExitJob } from '../src/env';
import { VaultWatcher, type VaultReading, type WatcherDeps } from '../src/watcher';

const MIRROR = NETWORKS.testnet.vaults[0].address;
const OWNER_A = '0x00000000000000000000000000000000000000a1' as const;
const OWNER_B = '0x00000000000000000000000000000000000000b2' as const;

const reading = (utilBps: number): VaultReading => ({
  stats: { apyBps: 500, utilBps, liquidityPct: null }, totalAssets: 1_000_000_000n, pps: 1_000_000n,
});

function detailed(action: 'hold' | 'exit', confidence: number): DetailedPositionJudgment {
  return {
    judgment: { action: { value: action, confidence }, withdrawalRisk: 0.4, yieldCollapse: 0.1, statsHash: 'h', at: '2026-10-11T18:00:00Z' },
    state: 'state text', questions: { q: 1 } as never, answers: { a: 1 } as never, model: 'jev-latest',
  };
}

function fakeDeps(over: Partial<WatcherDeps> & { util?: number } = {}) {
  const calls = { posts: [] as unknown[], jobs: [] as ExitJob[], judged: 0 };
  const deps: WatcherDeps = {
    readVault: async () => reading(over.util ?? 5000),
    readFlows: async () => null,
    readProtections: async () => [{ owner: OWNER_A, minConfidenceBps: 9000 }, { owner: OWNER_B, minConfidenceBps: 9500 }],
    judge: async () => { calls.judged++; return detailed('exit', 0.92); },
    post: async (...args) => { calls.posts.push(args); return { id: 7n, txHash: `0x${'77'.repeat(32)}` }; },
    enqueue: async (job) => { calls.jobs.push(job); },
    ...over,
  };
  return { deps, calls };
}

async function startWatcher(deps: WatcherDeps) {
  const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`testnet:${MIRROR}:${crypto.randomUUID()}`));
  await runInDurableObject(stub, async (instance: VaultWatcher) => {
    instance.deps = deps;
    await instance.start('testnet', MIRROR);
  });
  return stub;
}

const events = async () => (await env.DB.prepare('SELECT type, owner, message FROM events ORDER BY at, id').all<{ type: string; owner: string | null; message: string }>()).results;
const alarmOf = (stub: DurableObjectStub) => runInDurableObject(stub, (_i, state) => state.storage.getAlarm());

describe('VaultWatcher', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM events; DELETE FROM vault_health; DELETE FROM posts;'); });

  it('watcher: Jev throws → no post, jev_unavailable event, alarm rescheduled', async () => {
    const { deps, calls } = fakeDeps({ judge: async () => { throw new JevUnavailable('Jev HTTP 503'); } });
    const stub = await startWatcher(deps);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(calls.posts).toHaveLength(0);
    expect((await events()).map((e) => e.type)).toEqual(['jev_unavailable']);
    expect(await alarmOf(stub)).not.toBeNull();
  });

  it('watcher: util 9600 + Jev down → alert event', async () => {
    const { deps } = fakeDeps({ util: 9600, judge: async () => { throw new JevUnavailable('down'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    expect((await events()).map((e) => e.type).sort()).toEqual(['alert', 'jev_unavailable']);
  });

  it('watcher: EXIT 9200 posts once and enqueues only owners at or below 9200', async () => {
    const { deps, calls } = fakeDeps();
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    expect(calls.posts).toHaveLength(1);
    const [network, vault, judgment, doc] = calls.posts[0] as [string, string, { action: { value: string } }, { state: string; answers: unknown; network: string; vault: string; drill: boolean; model: string }];
    expect([network, vault, judgment.action.value]).toEqual(['testnet', MIRROR, 'exit']);
    expect(doc).toMatchObject({ v: 1, network: 'testnet', vault: MIRROR, state: 'state text', answers: { a: 1 }, model: 'jev-latest', drill: false });
    expect(calls.jobs).toEqual([{ network: 'testnet', vault: MIRROR, owner: OWNER_A, verdictId: '7' }]);
    const health = await env.DB.prepare('SELECT last_post_at, last_error FROM vault_health WHERE network = ? AND vault = ?').bind('testnet', MIRROR.toLowerCase()).first();
    expect(health?.last_post_at).not.toBeNull();
    expect(health?.last_error).toBeNull();
    expect(await alarmOf(stub)).not.toBeNull();
  });

  it('watcher: unchanged stats after a post skip Jev', async () => {
    const { deps, calls } = fakeDeps({ judge: async () => { calls.judged++; return detailed('hold', 0.8); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    // The DO checks D1 for an existing post; mirror what postVerdict would have written.
    await env.DB.prepare(`INSERT INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at) VALUES ('testnet', 7, ?, 0, 8000, 4000, '0x', 1)`).bind(MIRROR.toLowerCase()).run();
    await runDurableObjectAlarm(stub);
    expect(calls.judged).toBe(1);
  });

  it('watcher: a post failure is recorded in vault_health and the alarm still reschedules', async () => {
    const { deps } = fakeDeps({ post: async () => { throw new Error('rpc down'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    const health = await env.DB.prepare('SELECT last_error FROM vault_health').first<{ last_error: string }>();
    expect(health?.last_error).toContain('rpc down');
    expect(await alarmOf(stub)).not.toBeNull();
  });
});
