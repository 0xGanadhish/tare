import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Intent, Pool, Verdict } from '../../shared/types';
import fixture from '../../fixtures/pools.json';
import { NETWORKS } from '../../shared/networks';
import { GET as poolsGET } from './pools/route';
import { GET as poolGET } from './pools/[id]/route';
import { POST as intentPOST } from './intent/route';
import { POST as advisePOST } from './advise/route';
import { GET as scanGET } from './scan/[address]/route';
import { GET as positionsGET } from './positions/[address]/route';
import { GET as streamGET } from './watch/stream/route';
import { POST as statsPOST } from './admin/stats/route';

const mocks = vi.hoisted(() => ({ readPools: vi.fn(), readVerdicts: vi.fn(), readEvents: vi.fn(),
  scan: vi.fn(), positions: vi.fn(), sendSetStats: vi.fn(),
  addresses: { mirrors: [{ address: '0x2222222222222222222222222222222222222222', poolId: 'stable', mirrorOf: 'USDC mirror' }] },
}));
vi.mock('../../shared/cache', () => ({ readPools: mocks.readPools, readVerdicts: mocks.readVerdicts, readEvents: mocks.readEvents }));
vi.mock('../../shared/contracts', () => ({ addresses: mocks.addresses }));
vi.mock('../../lib/idle', () => ({ scanAddress: mocks.scan }));
vi.mock('../../lib/positions', async (original) => ({ ...await original<typeof import('../../lib/positions')>(), readPositions: mocks.positions }));
vi.mock('../../worker/operator', () => ({ sendSetStats: mocks.sendSetStats }));

const owner = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';
const intent: Intent = { text: '500 USDC', amount: 500, asset: 'USDC', risk: { value: 'low', confidence: 1 },
  horizon: { value: 'medium', confidence: 1 }, assetPref: { value: 'stable', confidence: 1 } };
const pools = ['stable', 'gold', 'higher', 'avoid', 'risky'].map((id, index): Pool => ({ ...fixture.pools[1] as Pool,
  id, project: index === 1 ? 'gold-project' : 'stable-project', assetClass: index === 1 ? 'gold' : 'stable', realApy: index + 1 }));
const verdicts = Object.fromEntries(pools.map((p): [string, Verdict] => [p.id, {
  poolId: p.id, label: p.id === 'avoid' ? 'AVOID' : 'DEPOSIT', confidence: 0.9, risk: p.id === 'risky' ? 4 : 2,
  yieldSource: 'organic', band: 'high', flags: [], statsHash: 'hash', judgedAt: '2026-10-10T00:00:00Z',
}]));
const request = (path: string, body: unknown, token?: string) => new Request(`http://x${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.stubEnv('OFFLINE', '');
  vi.stubEnv('DATA_SOURCE', '');
  vi.stubEnv('ADMIN_TOKEN', 'test-admin');
  vi.stubEnv('TYPESAFE_API_KEY', 'unit-test');
  mocks.readPools.mockResolvedValue({ pools, asOf: '2026-10-10T00:00:00Z' });
  mocks.readVerdicts.mockResolvedValue(verdicts);
  mocks.readEvents.mockResolvedValue([]);
  mocks.addresses.mirrors = [{ address: vault, poolId: 'stable', mirrorOf: 'USDC mirror' }];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test.each(['vitalik.eth', owner.slice(2), '0x123'])('invalid scan %s returns friendly 400 before RPC', async (address) => {
  const response = await scanGET(new Request(`http://x/api/scan/${address}`), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Not a valid Monad address' });
  expect(mocks.scan).not.toHaveBeenCalled();
});
test('invalid position owner returns friendly 400', async () => {
  const response = await positionsGET(new Request('http://x/api/positions/0x123'), { params: Promise.resolve({ address: '0x123' }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Not a valid Monad address' });
});
test('scan RPC failure becomes a friendly 503, not raw exception details', async () => {
  mocks.scan.mockRejectedValueOnce(new Error('secret RPC internal error'));
  const response = await scanGET(new Request(`http://x/api/scan/${owner}`), { params: Promise.resolve({ address: owner }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Couldn't read this wallet" });
});
test('empty deployment returns empty position shape', async () => {
  mocks.positions.mockResolvedValueOnce([]);
  const response = await positionsGET(new Request(`http://x/api/positions/${owner}`), { params: Promise.resolve({ address: owner }) });
  expect(await response.json()).toEqual({ positions: [] });
  expect(mocks.positions).toHaveBeenCalledWith('testnet', owner);
});
test('positions read the network from ?network= and reject unknown networks', async () => {
  mocks.positions.mockResolvedValueOnce([]);
  await positionsGET(new Request(`http://x/api/positions/${owner}?network=mainnet`), { params: Promise.resolve({ address: owner }) });
  expect(mocks.positions).toHaveBeenCalledWith('mainnet', owner);
  const bad = await positionsGET(new Request(`http://x/api/positions/${owner}?network=foo`), { params: Promise.resolve({ address: owner }) });
  expect(bad.status).toBe(400);
});
test('positions serialize bigints as strings', async () => {
  mocks.positions.mockResolvedValueOnce([{ vault: { address: vault }, shares: 5n, assets: 6n, redeemable: 5n, rule: null, latest: null }]);
  const response = await positionsGET(new Request(`http://x/api/positions/${owner}`), { params: Promise.resolve({ address: owner }) });
  expect(await response.json()).toEqual({ positions: [{ vault: { address: vault }, shares: '5', assets: '6', redeemable: '5', rule: null, latest: null }] });
});
test('pool filters intersect asset and protocol, preserving asOf and matching verdicts', async () => {
  const response = await poolsGET(new Request('http://x/api/pools?asset=gold&protocol=gold-project'));
  expect(await response.json()).toEqual({ pools: [pools[1]], verdicts: { gold: verdicts.gold }, asOf: '2026-10-10T00:00:00Z' });
  const empty = await poolsGET(new Request('http://x/api/pools?asset=gold&protocol=stable-project'));
  expect((await empty.json()).pools).toEqual([]);
});
test('unknown pool returns 404 rather than fetching arbitrary chart ids', async () => {
  const response = await poolGET(new Request('http://x/api/pools/missing'), { params: Promise.resolve({ id: 'missing' }) });
  expect(response.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
test('history retains only 90 days, normalizes null APY, caches one hour, and serves stale on outage', async () => {
  vi.useFakeTimers();
  const now = new Date('2026-10-10T00:00:00Z');
  vi.setSystemTime(now);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ data: [
    { timestamp: '2026-01-01T00:00:00Z', apy: 10, tvlUsd: 100 },
    { timestamp: '2026-10-09T00:00:00Z', apy: null, tvlUsd: 300 },
  ] })).mockResolvedValueOnce(new Response('', { status: 503 })));
  const get = () => poolGET(new Request('http://x/api/pools/higher'), { params: Promise.resolve({ id: 'higher' }) });
  const history = [{ t: '2026-10-09T00:00:00.000Z', apy: 0, tvlUsd: 300 }];
  expect((await (await get()).json()).history).toEqual(history);
  vi.setSystemTime(new Date(now.getTime() + 3_599_999));
  expect((await (await get()).json()).history).toEqual(history);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date(now.getTime() + 3_600_001));
  expect((await (await get()).json()).history).toEqual(history);
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('unavailable history returns an empty history without hiding the cached pool', async () => {
  const response = await poolGET(new Request('http://x/api/pools/gold'), { params: Promise.resolve({ id: 'gold' }) });
  expect(await response.json()).toMatchObject({ pool: pools[1], verdict: verdicts.gold, history: [] });
});
test('Jev outage returns Intent with parsed amount and manual confidence-zero choices', async () => {
  const response = await intentPOST(request('/api/intent', { text: '$1.5k for 3 months' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ amount: 1500, risk: { confidence: 0 }, horizon: { confidence: 0 }, assetPref: { confidence: 0 } });
});
test.each([{}, { text: 12 }, { text: '   ' }])('invalid intent body yields 400', async (body) => {
  expect((await intentPOST(request('/api/intent', body))).status).toBe(400);
});
test('malformed JSON yields 400', async () => {
  const response = await intentPOST(new Request('http://x/api/intent', { method: 'POST', body: '{' }));
  expect(response.status).toBe(400);
});
test('advice respects asset/risk/avoid filters, ranks real APY, and links exact mirror', async () => {
  const response = await advisePOST(request('/api/advise', { intent }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.recommendations.map((r: { pool: Pool }) => r.pool.id)).toEqual(['higher', 'stable']);
  expect(result.recommendations[1].mirrorVault).toBe(vault);
  expect(result.recommendations[0].expectedReturnUsd).toBeCloseTo(500 * 3 / 100 * 90 / 365);
});
test('advice lists the Tare vaults on the requested network that the top picks left out', async () => {
  const clearstar = NETWORKS.mainnet.vaults.find((v) => v.name === 'Clearstar Earn USDC')!;
  const extra: Pool = { ...pools[0], id: clearstar.poolId!, realApy: 0.5 };
  mocks.readPools.mockResolvedValue({ pools: [...pools, extra], asOf: '2026-10-10T00:00:00Z' });
  mocks.readVerdicts.mockResolvedValue({ ...verdicts, [extra.id]: { ...verdicts.stable, poolId: extra.id, label: 'CONSIDER', risk: 2.23 } });
  const mainnet = await (await advisePOST(request('/api/advise', { intent, network: 'mainnet' }))).json();
  expect(mainnet.recommendations.map((r: { pool: Pool }) => r.pool.id)).toEqual(['higher', 'stable']);
  expect(mainnet.covered.map((r: { pool: Pool }) => r.pool.id)).toEqual([extra.id]);
  expect((await (await advisePOST(request('/api/advise', { intent }))).json()).covered).toEqual([]);
  expect((await advisePOST(request('/api/advise', { intent, network: 'devnet' }))).status).toBe(400);
});
test.each([
  {}, { intent: { ...intent, amount: -1 } }, { intent: { ...intent, risk: { value: 'yolo', confidence: 1 } } },
  { intent: { ...intent, horizon: { value: 'medium', confidence: 2 } } }, { intent: { ...intent, assetPref: { value: 'btc', confidence: 1 } } },
])('invalid structured intent yields 400 rather than unsafe ranking', async (body) => {
  expect((await advisePOST(request('/api/advise', body))).status).toBe(400);
});
test.each([undefined, 'wrong'])('admin rejects missing/wrong token without sending a transaction', async (token) => {
  expect((await statsPOST(request('/api/admin/stats', { vault, apyBps: 500, utilBps: 7100 }, token))).status).toBe(401);
  expect(mocks.sendSetStats).not.toHaveBeenCalled();
});
test('unset ADMIN_TOKEN fails closed even when header is absent', async () => {
  vi.stubEnv('ADMIN_TOKEN', '');
  expect((await statsPOST(request('/api/admin/stats', { vault, apyBps: 500, utilBps: 7100 }))).status).toBe(401);
  expect(mocks.sendSetStats).not.toHaveBeenCalled();
});
test.each([
  { vault: owner, apyBps: 500, utilBps: 7100 }, { vault, apyBps: 65536, utilBps: 7100 },
  { vault, apyBps: -1, utilBps: 7100 }, { vault, apyBps: 1.5, utilBps: 7100 }, { vault, apyBps: 500, utilBps: 10001 },
])('admin rejects invalid/unapproved stats before signing', async (body) => {
  expect((await statsPOST(request('/api/admin/stats', body, 'test-admin'))).status).toBe(400);
  expect(mocks.sendSetStats).not.toHaveBeenCalled();
});
test('admin serializes confirmed receipt block as a decimal string', async () => {
  mocks.sendSetStats.mockResolvedValueOnce({ txHash: `0x${'a'.repeat(64)}`, block: 9007199254740993n, seconds: 0.8 });
  const response = await statsPOST(request('/api/admin/stats', { vault, apyBps: 0, utilBps: 10000 }, 'test-admin'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ txHash: `0x${'a'.repeat(64)}`, block: '9007199254740993', seconds: 0.8 });
});
test('operator failure never produces transaction success or leaks exception details', async () => {
  mocks.sendSetStats.mockRejectedValueOnce(new Error('operator secret details'));
  const response = await statsPOST(request('/api/admin/stats', { vault, apyBps: 500, utilBps: 7100 }, 'test-admin'));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'Could not confirm stats transaction' });
});
test('SSE resumes at Last-Event-ID, frames events, polls at 500ms, and stops on abort', async () => {
  vi.useFakeTimers();
  const events = [
    { id: 'one', type: 'stats_changed', vault, at: '2026-10-10T00:00:00Z', message: 'old' },
    { id: 'two', type: 'judged', vault, at: '2026-10-10T00:00:01Z', message: 'new' },
  ];
  mocks.readEvents.mockImplementation(async (afterId?: string) => events.slice(afterId ? events.findIndex((e) => e.id === afterId) + 1 : 0));
  const abort = new AbortController();
  const response = await streamGET(new Request('http://x/api/watch/stream', { headers: { 'Last-Event-ID': 'one' }, signal: abort.signal }));
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toBe(`id: two\ndata: ${JSON.stringify(events[1])}\n\n`);
  events.push({ ...events[1], id: 'three', message: 'next' });
  await vi.advanceTimersByTimeAsync(500);
  expect(decoder.decode((await reader.read()).value)).toContain('id: three\n');
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  const calls = mocks.readEvents.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1500);
  expect(mocks.readEvents.mock.calls.length).toBe(calls);
});
