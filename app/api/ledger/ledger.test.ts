import { afterEach, expect, test, vi } from 'vitest';
import { GET as verdictsGET } from './verdicts/route';
import { GET as scoreGET } from './score/route';

const get = (fn: (r: Request) => Promise<Response>, q: string) => fn(new Request(`http://x/api/ledger?${q}`));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test('no backend and not fixtures → 503, never invented rows', async () => {
  vi.stubEnv('DATA_SOURCE', '');
  vi.stubEnv('BACKEND_URL', '');
  expect((await get(verdictsGET, 'network=testnet')).status).toBe(503);
  expect((await get(scoreGET, 'network=testnet')).status).toBe(503);
});

test('unknown network → 400', async () => {
  vi.stubEnv('DATA_SOURCE', 'fixtures');
  expect((await get(verdictsGET, 'network=foo')).status).toBe(400);
  expect((await get(scoreGET, 'network=foo')).status).toBe(400);
});

test('fixtures mode serves sample rows for the network, newest first, labelled as fixtures', async () => {
  vi.stubEnv('DATA_SOURCE', 'fixtures');
  const body = await (await get(verdictsGET, 'network=testnet')).json();
  expect(body.source).toBe('fixtures');
  expect(body.verdicts.length).toBeGreaterThan(0);
  expect(body.verdicts.every((v: { network: string }) => v.network === 'testnet')).toBe(true);
  const ids = body.verdicts.map((v: { id: number }) => v.id);
  expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
});

test('fixtures mode pages with limit and cursor', async () => {
  vi.stubEnv('DATA_SOURCE', 'fixtures');
  const first = await (await get(verdictsGET, 'network=testnet&limit=2')).json();
  expect(first.verdicts).toHaveLength(2);
  expect(first.cursor).toBe(String(first.verdicts[1].id));
  const next = await (await get(verdictsGET, `network=testnet&limit=2&cursor=${first.cursor}`)).json();
  expect(next.verdicts[0].id).toBeLessThan(first.verdicts[1].id);
});

test('fixtures score uses scoreLedger and skips drills', async () => {
  vi.stubEnv('DATA_SOURCE', 'fixtures');
  const body = await (await get(scoreGET, 'network=testnet')).json();
  expect(body.source).toBe('fixtures');
  expect(body.score.early).toBe(true);
  expect(body.score.bands).toHaveLength(4);
});

test('proxies the backend when BACKEND_URL is set', async () => {
  vi.stubEnv('DATA_SOURCE', '');
  vi.stubEnv('BACKEND_URL', 'https://api.example');
  const fetchFn = vi.fn(async () => new Response(JSON.stringify({ verdicts: [], cursor: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchFn);
  const body = await (await get(verdictsGET, 'network=mainnet&vault=0x1111111111111111111111111111111111111111&limit=5')).json();
  expect(body).toEqual({ verdicts: [], cursor: null, source: 'backend' });
  expect(fetchFn).toHaveBeenCalledWith('https://api.example/v1/verdicts?network=mainnet&vault=0x1111111111111111111111111111111111111111&limit=5', expect.anything());
});
