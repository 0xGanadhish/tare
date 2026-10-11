import { env, SELF, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NETWORKS } from '../../shared/networks';

const post = (path: string, body: unknown, token?: string) => SELF.fetch(`https://backend.test${path}`, {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

describe('admin: watchers', () => {
  it('watchers/start: missing or wrong token → 401', async () => {
    expect((await post('/v1/admin/watchers/start', {})).status).toBe(401);
    expect((await post('/v1/admin/watchers/start', {}, 'wrong')).status).toBe(401);
  });

  it('watchers/start: starts one watcher per configured vault', async () => {
    const res = await post('/v1/admin/watchers/start', {}, 'test-admin-token');
    expect(res.status).toBe(200);
    const body = await res.json<{ started: { network: string; vault: string }[] }>();
    const expected = (['testnet', 'mainnet'] as const).flatMap((n) => NETWORKS[n].vaults.map((v) => ({ network: n, vault: v.address })));
    expect(body.started).toEqual(expected);
    const first = expected[0];
    const stub = env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`${first.network}:${first.vault.toLowerCase()}`));
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).not.toBeNull();
  });
});

import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';
import { beforeEach } from 'vitest';
import { abis } from '../../shared/contracts';
import { stateHash } from '../../shared/verdict';
import { handleAdmin, type AdminDeps } from '../src/admin';
import { handleHealth, type HealthDeps } from '../src/health';
import type { SendRequest, SendResult } from '../src/txSender';

const MIRROR = NETWORKS.testnet.vaults[0].address;
const req = (path: string, body: unknown, token = 'test-admin-token') => new Request(`https://backend.test${path}`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
});

function adminDeps() {
  const sent: (SendRequest & { role: string })[] = [];
  const deps: AdminDeps = {
    sender: (_network, role) => ({
      send: async (r: SendRequest): Promise<SendResult> => {
        sent.push({ ...r, role });
        const logs = [];
        if (r.kind === 'post') {
          const { args } = decodeFunctionData({ abi: abis.oracle, data: r.data });
          logs.push({
            address: NETWORKS.testnet.oracle,
            topics: encodeEventTopics({ abi: abis.oracle, eventName: 'VerdictPosted', args: { id: 99n, vault: args![0] as Hex } }) as [Hex, ...Hex[]],
            data: encodeAbiParameters([{ type: 'uint8' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'bytes32' }, { type: 'uint64' }], [args![1] as number, args![2] as number, args![3] as number, args![4] as Hex, 1_760_000_000n]),
          });
        }
        return { hash: `0x${'dd'.repeat(32)}`, status: 'success', blockNumber: 1n, gasUsed: 1n, logs };
      },
    }),
  };
  return { deps, sent };
}

describe('admin: stats', () => {
  it('admin stats: missing token 401', async () => {
    const { deps, sent } = adminDeps();
    const res = await handleAdmin(req('/v1/admin/stats', { network: 'testnet', vault: MIRROR, apyBps: 500, utilBps: 9600 }, 'nope'), env, deps);
    expect(res?.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('admin stats: mainnet returns 404', async () => {
    const { deps, sent } = adminDeps();
    const res = await handleAdmin(req('/v1/admin/stats', { network: 'mainnet', vault: MIRROR, apyBps: 500, utilBps: 9600 }), env, deps);
    expect(res?.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it('admin stats: testnet sends setStats from the attester', async () => {
    const { deps, sent } = adminDeps();
    const res = await handleAdmin(req('/v1/admin/stats', { network: 'testnet', vault: MIRROR, apyBps: 500, utilBps: 9600 }), env, deps);
    expect(res?.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: MIRROR, kind: 'admin', role: 'attester' });
    expect(decodeFunctionData({ abi: abis.mirrorVault, data: sent[0].data })).toMatchObject({ functionName: 'setStats', args: [500, 9600] });
  });

  it('admin stats: unknown vault or out-of-range bps → 400', async () => {
    const { deps } = adminDeps();
    expect((await handleAdmin(req('/v1/admin/stats', { network: 'testnet', vault: '0x0000000000000000000000000000000000000001', apyBps: 1, utilBps: 1 }), env, deps))?.status).toBe(400);
    expect((await handleAdmin(req('/v1/admin/stats', { network: 'testnet', vault: MIRROR, apyBps: 1, utilBps: 10_001 }), env, deps))?.status).toBe(400);
  });
});

describe('admin: drill', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM posts;'); });

  it('drill route: requires token; writes drill=1 and drill:true in R2', async () => {
    const { deps, sent } = adminDeps();
    expect((await handleAdmin(req('/v1/admin/drill', { network: 'testnet', vault: MIRROR }, 'nope'), env, deps))?.status).toBe(401);
    expect(sent).toHaveLength(0);
    const res = await handleAdmin(req('/v1/admin/drill', { network: 'testnet', vault: MIRROR }), env, deps);
    expect(res?.status).toBe(200);
    const body = await res!.json<{ id: string; txHash: string; stateHash: Hex }>();
    expect(body.id).toBe('99');
    expect(sent[0]).toMatchObject({ kind: 'post', role: 'attester', to: NETWORKS.testnet.oracle });
    const { args } = decodeFunctionData({ abi: abis.oracle, data: sent[0].data });
    expect(args!.slice(1, 3)).toEqual([1, 9500]); // EXIT at 95%
    const row = await env.DB.prepare('SELECT drill, verdict, confidence_bps FROM posts WHERE id = 99').first();
    expect(row).toEqual({ drill: 1, verdict: 1, confidence_bps: 9500 });
    const doc = await (await env.STATE.get(`state/${body.stateHash}.json`))!.json<{ drill: boolean; state: string }>();
    expect(doc.drill).toBe(true);
    expect(doc.state).toMatch(/drill/i);
    expect(stateHash(doc as never)).toBe(body.stateHash);
  });
});

describe('health', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM vault_health; DELETE FROM exits;'); });
  const healthy: HealthDeps = { balanceOf: async () => 10n ** 18n, networks: () => ['testnet'] };
  const tick = (secondsAgo: number, error: string | null = null) => env.DB.prepare(`INSERT INTO vault_health (network, vault, last_post_at, last_error, updated_at) VALUES ('testnet', ?, ?, ?, ?)`)
    .bind(MIRROR.toLowerCase(), new Date(Date.now() - 600_000).toISOString(), error, new Date(Date.now() - secondsAgo * 1000).toISOString()).run();

  it('health: fresh vault and funded keys → 200', async () => {
    await tick(2);
    const res = await handleHealth(env, healthy);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; vaults: { lastPostAgeS: number; lastTickAgeS: number; lastError: string | null }[]; queueBacklog: number; balances: Record<string, unknown> }>();
    expect(body.ok).toBe(true);
    expect(body.vaults[0].lastPostAgeS).toBeGreaterThanOrEqual(599);
    expect(body.vaults[0].lastTickAgeS).toBeLessThan(5);
    expect(body.queueBacklog).toBe(0);
    expect(body.balances).toEqual({ testnet: { attester: '1', executor: '1' } });
  });

  it('health: stale vault → 503', async () => {
    await tick(16); // 3 × 5 s testnet alarm = 15 s
    expect((await handleHealth(env, healthy)).status).toBe(503);
  });

  it('health: a vault with a recorded error is reported but does not turn the check red', async () => {
    await tick(60, 'Jev HTTP 503');
    const res = await handleHealth(env, healthy);
    expect(res.status).toBe(200);
    expect((await res.json<{ vaults: { lastError: string }[] }>()).vaults[0].lastError).toBe('Jev HTTP 503');
  });

  it('health: attester below 0.05 MON → 503', async () => {
    await tick(2);
    const res = await handleHealth(env, { ...healthy, balanceOf: async (_n, role) => (role === 'attester' ? 4n * 10n ** 16n : 10n ** 18n) });
    expect(res.status).toBe(503);
  });

  it('health: counts exits waiting on a retry as backlog', async () => {
    await tick(2);
    await env.DB.prepare(`INSERT INTO exits (network, verdict_id, owner, status, at) VALUES ('testnet', '1', '0xa', 'failed', 'x'), ('testnet', '2', '0xb', 'confirmed', 'x')`).run();
    expect((await (await handleHealth(env, healthy)).json<{ queueBacklog: number }>()).queueBacklog).toBe(1);
  });
});
