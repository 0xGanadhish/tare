import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

const VAULT = '0x7504b078d1f2b90fb9fcaf3d22753311013ea0ac';
const HASH = `0x${'ab'.repeat(32)}`;

async function seedPosts(network: string, ids: number[]) {
  for (const id of ids) {
    await env.DB.prepare(`INSERT INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at, tx_hash)
      VALUES (?, ?, ?, 1, 9200, 4000, ?, ?, ?)`).bind(network, id, VAULT, HASH, 1_700_000_000 + id, `0x${String(id).padStart(64, '0')}`).run();
  }
}

const get = (path: string) => SELF.fetch(`https://backend.test${path}`);

describe('read API', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM posts; DELETE FROM events; DELETE FROM pools; DELETE FROM pool_verdicts;');
  });

  it('/v1/verdicts returns newest first', async () => {
    await seedPosts('testnet', [1, 2, 3]);
    await seedPosts('mainnet', [1]);
    const res = await get('/v1/verdicts?network=testnet');
    expect(res.status).toBe(200);
    const body = await res.json<{ verdicts: { id: number; network: string }[] }>();
    expect(body.verdicts.map((v) => v.id)).toEqual([3, 2, 1]);
    expect(body.verdicts.every((v) => v.network === 'testnet')).toBe(true);
  });

  it('/v1/verdicts honours limit=2 with a cursor', async () => {
    await seedPosts('testnet', [1, 2, 3]);
    const first = await (await get('/v1/verdicts?network=testnet&limit=2')).json<{ verdicts: { id: number }[]; cursor: string | null }>();
    expect(first.verdicts.map((v) => v.id)).toEqual([3, 2]);
    expect(first.cursor).not.toBeNull();
    const second = await (await get(`/v1/verdicts?network=testnet&limit=2&cursor=${first.cursor}`)).json<{ verdicts: { id: number }[]; cursor: string | null }>();
    expect(second.verdicts.map((v) => v.id)).toEqual([1]);
    expect(second.cursor).toBeNull();
  });

  it('/v1/verdicts caps limit at 100 and filters by vault', async () => {
    await seedPosts('testnet', [1]);
    const res = await get(`/v1/verdicts?network=testnet&limit=500&vault=0x0000000000000000000000000000000000000001`);
    expect(res.status).toBe(200);
    expect((await res.json<{ verdicts: unknown[] }>()).verdicts).toEqual([]);
  });

  it('network=foo → 400', async () => {
    expect((await get('/v1/verdicts?network=foo')).status).toBe(400);
    expect((await get(`/v1/vaults/foo/${VAULT}/latest`)).status).toBe(400);
    expect((await get(`/v1/events/foo/${VAULT}`)).status).toBe(400);
    expect((await get('/v1/ledger/score?network=foo')).status).toBe(400);
  });

  it('/v1/vaults/:network/:vault/latest → 404 when empty, 200 with the row when seeded', async () => {
    expect((await get(`/v1/vaults/testnet/${VAULT}/latest`)).status).toBe(404);
    await seedPosts('testnet', [4, 7]);
    const res = await get(`/v1/vaults/testnet/${VAULT.toUpperCase().replace('0X', '0x')}/latest`);
    expect(res.status).toBe(200);
    const body = await res.json<{ verdict: { id: number; vault: string; confidenceBps: number; stateHash: string } }>();
    expect(body.verdict).toMatchObject({ id: 7, vault: VAULT, confidenceBps: 9200, stateHash: HASH });
  });

  it('CORS header present', async () => {
    const res = await get('/v1/verdicts?network=testnet');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const preflight = await SELF.fetch('https://backend.test/v1/verdicts', { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('/v1/pools and /v1/pools/:id serve the scanned pools with their verdicts', async () => {
    await env.DB.prepare('INSERT INTO pools (network, id, json, updated_at) VALUES (?, ?, ?, ?)').bind('mainnet', 'p1', JSON.stringify({ id: 'p1', apy: 5 }), '2026-10-11T00:00:00Z').run();
    await env.DB.prepare('INSERT INTO pool_verdicts (network, pool_id, json, judged_at) VALUES (?, ?, ?, ?)').bind('mainnet', 'p1', JSON.stringify({ poolId: 'p1', label: 'DEPOSIT' }), '2026-10-11T00:00:00Z').run();
    const list = await (await get('/v1/pools')).json<{ pools: { id: string }[]; verdicts: Record<string, { label: string }>; asOf: string | null }>();
    expect(list.pools).toEqual([{ id: 'p1', apy: 5 }]);
    expect(list.verdicts.p1.label).toBe('DEPOSIT');
    expect(list.asOf).toBe('2026-10-11T00:00:00Z');
    const one = await get('/v1/pools/p1');
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual({ pool: { id: 'p1', apy: 5 }, verdict: { poolId: 'p1', label: 'DEPOSIT' } });
    expect((await get('/v1/pools/nope')).status).toBe(404);
  });

  it('/v1/events/:network/:owner returns the owner events after `since`', async () => {
    const owner = '0x00000000000000000000000000000000000000aa';
    for (const [id, at] of [['e1', '2026-10-11T00:00:01Z'], ['e2', '2026-10-11T00:00:02Z']]) {
      await env.DB.prepare('INSERT INTO events (network, id, owner, vault, type, message, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('testnet', id, owner, VAULT, 'judged', 'msg', at).run();
    }
    const all = await (await get(`/v1/events/testnet/${owner}`)).json<{ events: { id: string }[] }>();
    expect(all.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    const after = await (await get(`/v1/events/testnet/${owner}?since=2026-10-11T00:00:01Z`)).json<{ events: { id: string }[] }>();
    expect(after.events.map((e) => e.id)).toEqual(['e2']);
  });

  it('/v1/ledger/score scores resolved, non-drill posts by verdict', async () => {
    const add = (id: number, verdict: number, conf: number, adverse: number | null, drill = 0) => env.DB.prepare(`INSERT INTO posts
      (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at, resolved, adverse, drill) VALUES ('testnet', ?, ?, ?, ?, 5000, '0x', 1, ?, ?, ?)`)
      .bind(id, VAULT, verdict, conf, adverse === null ? 0 : 1, adverse, drill).run();
    await add(1, 1, 9600, 1); // EXIT then adverse: hit
    await add(2, 0, 9600, 1); // HOLD then adverse: miss
    await add(3, 1, 8500, null); // unresolved
    await add(4, 1, 9600, 0, 1); // drill: excluded
    const res = await get('/v1/ledger/score?network=testnet');
    expect(res.status).toBe(200);
    const body = await res.json<{ n: number; brier: number; early: boolean; bands: { band: string; n: number; hitRate: number | null }[] }>();
    expect(body.n).toBe(2);
    expect(body.brier).toBeCloseTo(0.25);
    expect(body.early).toBe(true);
    expect(body.bands).toEqual([
      { band: '<80', n: 0, hitRate: null }, { band: '80-89', n: 0, hitRate: null },
      { band: '90-94', n: 0, hitRate: null }, { band: '95-100', n: 2, hitRate: 0.5 },
    ]);
  });

  it('unknown route → 404 JSON', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
