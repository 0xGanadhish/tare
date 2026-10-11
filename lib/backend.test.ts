import { afterEach, describe, expect, test, vi } from 'vitest';
import { BackendUnavailable, createBackend } from './backend';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('backend client', () => {
  test('backend.verdicts builds the query string', async () => {
    const fetchFn = vi.fn(async () => ok({ verdicts: [], cursor: null }));
    const backend = createBackend('https://api.example/', fetchFn);
    await backend.verdicts({ network: 'mainnet', vault: '0x1111111111111111111111111111111111111111', cursor: '42', limit: 20 });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/v1/verdicts?network=mainnet&vault=0x1111111111111111111111111111111111111111&cursor=42&limit=20',
      expect.anything(),
    );
  });

  test('omits optional params', async () => {
    const fetchFn = vi.fn(async () => ok({ verdicts: [], cursor: null }));
    await createBackend('https://api.example', fetchFn).verdicts({ network: 'testnet' });
    expect(fetchFn).toHaveBeenCalledWith('https://api.example/v1/verdicts?network=testnet', expect.anything());
  });

  test('non-2xx throws BackendUnavailable', async () => {
    const backend = createBackend('https://api.example', async () => new Response('boom', { status: 500 }));
    await expect(backend.pools()).rejects.toBeInstanceOf(BackendUnavailable);
  });

  test('a network error throws BackendUnavailable', async () => {
    const backend = createBackend('https://api.example', async () => { throw new TypeError('fetch failed'); });
    await expect(backend.score('testnet')).rejects.toBeInstanceOf(BackendUnavailable);
  });

  test('latest returns null on 404 (no verdict yet), not an error', async () => {
    const backend = createBackend('https://api.example', async () => new Response('{"error":"not_found"}', { status: 404 }));
    await expect(backend.latest('testnet', '0x1111111111111111111111111111111111111111')).resolves.toBeNull();
  });

  test('events passes since and builds the path', async () => {
    const fetchFn = vi.fn(async () => ok({ events: [] }));
    await createBackend('https://api.example', fetchFn).events('testnet', '0xAbC0000000000000000000000000000000000001', '2026-10-11T00:00:00Z');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/v1/events/testnet/0xAbC0000000000000000000000000000000000001?since=2026-10-11T00%3A00%3A00Z',
      expect.anything(),
    );
  });
});

describe('readMarket source order', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  test('readMarket prefers fixtures when DATA_SOURCE=fixtures even if BACKEND_URL is set', async () => {
    vi.stubEnv('DATA_SOURCE', 'fixtures');
    vi.stubEnv('OFFLINE', '');
    vi.stubEnv('BACKEND_URL', 'https://api.example');
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const { readMarket } = await import('./api');
    const market = await readMarket();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(market.pools.length).toBeGreaterThan(0);
  });

  test('readMarket reads the backend when BACKEND_URL is set', async () => {
    vi.stubEnv('DATA_SOURCE', '');
    vi.stubEnv('OFFLINE', '');
    vi.stubEnv('BACKEND_URL', 'https://api.example');
    const fetchFn = vi.fn(async () => ok({ pools: [{ id: 'p1' }], verdicts: {}, asOf: '2026-10-11T00:00:00Z' }));
    vi.stubGlobal('fetch', fetchFn);
    const { readMarket } = await import('./api');
    expect(await readMarket()).toEqual({ pools: [{ id: 'p1' }], verdicts: {}, asOf: '2026-10-11T00:00:00Z' });
    expect(fetchFn).toHaveBeenCalledWith('https://api.example/v1/pools', expect.anything());
  });

  test('backend configured but down: readMarket fails instead of showing cache/fixture pools as live', async () => {
    vi.stubEnv('DATA_SOURCE', '');
    vi.stubEnv('OFFLINE', '');
    vi.stubEnv('BACKEND_URL', 'https://api.example');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const { readMarket } = await import('./api');
    await expect(readMarket()).rejects.toMatchObject({ name: 'BackendUnavailable' }); // resetModules gives a fresh class
  });
});
