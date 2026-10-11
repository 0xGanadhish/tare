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
