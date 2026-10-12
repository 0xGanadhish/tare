import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { JevUnavailable } from '../../lib/jev';
import type { DetailedPositionJudgment } from '../../lib/judge';
import { NETWORKS, UNDEPLOYED } from '../../shared/networks';
import type { ExitJob } from '../src/env';
import { ALARM_MS, HEARTBEAT_MS, VaultWatcher, watchOnce, type VaultReading, type WatcherDeps } from '../src/watcher';

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
    post: async (...args) => {
      calls.posts.push(args);
      // Mirror what postVerdict writes, so the next tick sees the vault has a post.
      await env.DB.prepare(`INSERT OR IGNORE INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at) VALUES ('testnet', 7, ?, 1, 9200, 4000, '0x', 1)`).bind(MIRROR.toLowerCase()).run();
      return { id: 7n, txHash: `0x${'77'.repeat(32)}` };
    },
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
async function pendingAlarmOf(stub: DurableObjectStub): Promise<number | null> {
  for (let i = 0; i < 40; i++) {
    const at = await alarmOf(stub);
    if (at !== null) return at;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

describe('VaultWatcher', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM events; DELETE FROM vault_health; DELETE FROM posts;'); });

  it('watcher: Jev throws → no post, jev_unavailable event, alarm rescheduled', async () => {
    const { deps, calls } = fakeDeps({ judge: async () => { throw new JevUnavailable('Jev HTTP 503'); } });
    const stub = await startWatcher(deps);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(calls.posts).toHaveLength(0);
    expect((await events()).filter((e) => e.owner === null).map((e) => e.type)).toEqual(['jev_unavailable']);
    expect(await alarmOf(stub)).not.toBeNull();
  });

  it('watcher: a vault removed from config stops ticking instead of re-arming forever', async () => {
    const { deps, calls } = fakeDeps();
    const gone = '0x000000000000000000000000000000000000dead' as const;
    const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`testnet:${gone}`));
    // An orphan armed before the fix: state and alarm already in storage.
    await runInDurableObject(stub, async (instance: VaultWatcher, state) => {
      instance.deps = deps;
      await state.storage.put('state', { network: 'testnet', vault: gone, last: null });
      await state.storage.setAlarm(Date.now() + 1_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(calls.judged).toBe(0);
    expect(await alarmOf(stub)).toBeNull();
  });

  it.skipIf(NETWORKS.mainnet.oracle !== UNDEPLOYED)('watcher: start() on a network without an oracle arms nothing', async () => {
    const { deps } = fakeDeps();
    const vault = '0x00000000000000000000000000000000000000c3' as const;
    const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`mainnet:${vault}`));
    await runInDurableObject(stub, async (instance: VaultWatcher) => { instance.deps = deps; await instance.start('mainnet', vault); });
    expect(await alarmOf(stub)).toBeNull();
  });

  it('watcher: start() replaces a stuck alarm (overdue, or further out than one tick)', async () => {
    const { deps } = fakeDeps();
    for (const offset of [-10 * 60_000, 60 * 60_000]) {
      const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`testnet:${MIRROR}:${crypto.randomUUID()}`));
      await runInDurableObject(stub, async (instance: VaultWatcher, state) => {
        instance.deps = deps;
        await state.storage.setAlarm(Date.now() + offset);
        await instance.start('testnet', MIRROR);
      });
      // An overdue alarm fires at once in the test runtime; while it runs, getAlarm() is briefly null until it re-arms.
      const at = await pendingAlarmOf(stub);
      expect(at).not.toBeNull();
      expect(at! - Date.now()).toBeGreaterThan(0);
      expect(at! - Date.now()).toBeLessThanOrEqual(ALARM_MS.testnet);
    }
  });

  it('watcher: start() keeps a healthy alarm', async () => {
    const { deps } = fakeDeps();
    const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`testnet:${MIRROR}:${crypto.randomUUID()}`));
    const soon = Date.now() + 5_000;
    await runInDurableObject(stub, async (instance: VaultWatcher, state) => {
      instance.deps = deps;
      await state.storage.setAlarm(soon);
      await instance.start('testnet', MIRROR);
    });
    expect(await alarmOf(stub)).toBe(soon);
  });

  it('watcher: testnet ticks every 15 s (5 s overran Workers Free Durable Object limits)', () => {
    expect(ALARM_MS.testnet).toBe(15_000);
  });

  it('watcher: util 9600 + Jev down → alert event', async () => {
    const { deps } = fakeDeps({ util: 9600, judge: async () => { throw new JevUnavailable('down'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    expect((await events()).filter((e) => e.owner === null).map((e) => e.type).sort()).toEqual(['alert', 'jev_unavailable']);
    expect((await events()).filter((e) => e.owner === OWNER_A.toLowerCase()).map((e) => e.type).sort()).toEqual(['alert', 'jev_unavailable']);
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
    const feed = await events();
    expect(feed.filter((e) => e.owner === OWNER_A.toLowerCase()).map((e) => e.type).sort()).toEqual(['exit_sent', 'posted']);
    expect(feed.filter((e) => e.owner === OWNER_B.toLowerCase()).map((e) => e.type).sort()).toEqual(['alert', 'posted']);
    expect(feed.filter((e) => e.owner === null).map((e) => e.type).sort()).toEqual(['alert', 'judged']);
    const health = await env.DB.prepare('SELECT last_post_at, last_error FROM vault_health WHERE network = ? AND vault = ?').bind('testnet', MIRROR.toLowerCase()).first();
    expect(health?.last_post_at).not.toBeNull();
    expect(health?.last_error).toBeNull();
    expect(await alarmOf(stub)).not.toBeNull();
  });

  it('watcher: unchanged stats after a post skip Jev', async () => {
    const { deps, calls } = fakeDeps({ judge: async () => { calls.judged++; return detailed('hold', 0.8); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    expect(calls.judged).toBe(1);
  });

  it('watcher: Jev down on two ticks warns each protected owner once', async () => {
    const { deps } = fakeDeps({ judge: async () => { throw new JevUnavailable('down'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    const warnings = (await events()).filter((e) => e.type === 'jev_unavailable');
    expect(warnings.map((e) => e.owner).sort()).toEqual([null, OWNER_A.toLowerCase(), OWNER_B.toLowerCase()].sort());
  });

  it('watcher: a failure after the post lands does not post again on the next tick', async () => {
    let fail = true;
    const { deps, calls } = fakeDeps({ readProtections: async () => { if (fail) { fail = false; throw new Error('d1 hiccup'); } return []; } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    expect(calls.posts).toHaveLength(1);
  });

  it('watcher: RPC URLs never reach vault_health', async () => {
    const { deps } = fakeDeps({ readVault: async () => { throw new Error('HTTP request failed. URL: https://monad-testnet.g.alchemy.com/v2/SECRETKEY'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    expect(await env.DB.prepare('SELECT last_error FROM vault_health').first('last_error')).not.toContain('SECRETKEY');
  });

  it('watcher: a post failure is recorded in vault_health and the alarm still reschedules', async () => {
    const { deps } = fakeDeps({ post: async () => { throw new Error('rpc down'); } });
    const stub = await startWatcher(deps);
    await runDurableObjectAlarm(stub);
    const health = await env.DB.prepare('SELECT last_error FROM vault_health').first<{ last_error: string }>();
    expect(health?.last_error).toContain('rpc down');
    expect(await alarmOf(stub)).not.toBeNull();
  });

  describe('heartbeat throttle', () => {
    const VAULT = NETWORKS.testnet.vaults[0];
    /** Wraps D1 so the test sees how many rows each statement actually wrote. */
    function countingDb(db: D1Database) {
      let written = 0;
      const wrap = (stmt: D1PreparedStatement): D1PreparedStatement => new Proxy(stmt, {
        get(target, prop) {
          if (prop === 'bind') return (...args: unknown[]) => wrap(target.bind(...args));
          if (prop === 'run') return async () => { const res = await target.run(); written += res.meta.rows_written ?? 0; return res; };
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const proxy = new Proxy(db, {
        get(target, prop) {
          if (prop === 'prepare') return (query: string) => wrap(target.prepare(query));
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      return { db: proxy, written: () => written };
    }
    const seed = (secondsAgo: number, error: string | null = null) => env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at) VALUES ('testnet', 7, ?, 1, 9200, 4000, '0x', 1)`).bind(VAULT.address.toLowerCase()),
      env.DB.prepare(`INSERT INTO vault_health (network, vault, last_post_at, last_error, updated_at) VALUES ('testnet', ?, '2026-10-11T00:00:00.000Z', ?, ?)`)
        .bind(VAULT.address.toLowerCase(), error, new Date(Date.now() - secondsAgo * 1000).toISOString()),
    ]);
    const updatedAt = () => env.DB.prepare('SELECT updated_at FROM vault_health').first<string>('updated_at');
    /** A steady tick: stats unchanged since the last post, so the watcher skips Jev. */
    const steadyTick = async (db: D1Database) => { const { deps } = fakeDeps(); await watchOnce(db, VAULT, 'testnet', reading(5000).stats, deps); };

    it('watcher: a steady tick inside the heartbeat window writes no D1 rows', async () => {
      await seed(10);
      const before = await updatedAt();
      const counting = countingDb(env.DB);
      await steadyTick(counting.db);
      expect(counting.written()).toBe(0);
      expect(await updatedAt()).toBe(before);
    });

    it('watcher: a steady tick after the heartbeat window refreshes updated_at', async () => {
      await seed(HEARTBEAT_MS.testnet / 1000 + 1);
      const before = await updatedAt();
      await steadyTick(env.DB);
      expect(Date.parse((await updatedAt())!)).toBeGreaterThan(Date.parse(before!));
    });

    it('watcher: a steady tick clears a previous error right away', async () => {
      await seed(10, 'rpc down');
      await steadyTick(env.DB);
      expect(await env.DB.prepare('SELECT last_error FROM vault_health').first('last_error')).toBeNull();
    });

    it('watcher: a new error is written inside the heartbeat window', async () => {
      await seed(10);
      const { deps } = fakeDeps({ readVault: async () => { throw new Error('rpc down'); } });
      await watchOnce(env.DB, VAULT, 'testnet', reading(5000).stats, deps);
      expect(await env.DB.prepare('SELECT last_error FROM vault_health').first('last_error')).toContain('rpc down');
    });
  });
});
