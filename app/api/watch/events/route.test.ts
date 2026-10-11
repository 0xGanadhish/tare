import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readEvents: vi.fn(), events: vi.fn(), backend: null as null | { events: ReturnType<typeof vi.fn> } }));
vi.mock('../../../../shared/cache', () => ({ readEvents: mocks.readEvents }));
vi.mock('../../../../lib/backend', async (original) => ({
  ...await original<typeof import('../../../../lib/backend')>(),
  serverBackend: () => mocks.backend,
}));
import { GET } from './route';
import { BackendUnavailable } from '../../../../lib/backend';

const owner = '0x1111111111111111111111111111111111111111';
const other = '0x9999999999999999999999999999999999999999';
const vault = '0x2222222222222222222222222222222222222222';
const get = (q: string) => GET(new Request(`http://x/api/watch/events?${q}`));

afterEach(() => { vi.clearAllMocks(); mocks.backend = null; });

test('rejects a bad owner or network', async () => {
  expect((await get(`network=testnet&owner=0x12`)).status).toBe(400);
  expect((await get(`network=foo&owner=${owner}`)).status).toBe(400);
});

test('proxies the backend when configured', async () => {
  mocks.backend = { events: vi.fn(async () => [{ id: 'e1', network: 'mainnet', owner, vault, type: 'posted', message: 'm', txHash: null, confidence: 0.9, at: '2026-10-11T00:00:00Z' }]) };
  const res = await get(`network=mainnet&owner=${owner}&since=2026-10-10T00:00:00Z`);
  expect(mocks.backend.events).toHaveBeenCalledWith('mainnet', owner, '2026-10-10T00:00:00Z');
  expect(await res.json()).toEqual({ events: [{ id: 'e1', at: '2026-10-11T00:00:00Z', vault, type: 'posted', message: 'm', txHash: null, confidence: 0.9 }] });
});

test('backend down → 503', async () => {
  mocks.backend = { events: vi.fn(async () => { throw new BackendUnavailable('/v1/events', 500); }) };
  expect((await get(`network=testnet&owner=${owner}`)).status).toBe(503);
});

test('no backend: testnet serves the local worker cache for this owner only; mainnet is empty', async () => {
  mocks.readEvents.mockResolvedValue([
    { id: 'a', at: '2026-10-11T00:00:00Z', vault, owner, type: 'alert', message: 'mine' },
    { id: 'b', at: '2026-10-11T00:00:01Z', vault, owner: other, type: 'alert', message: 'theirs' },
  ]);
  const res = await get(`network=testnet&owner=${owner}`);
  expect((await res.json()).events.map((e: { id: string }) => e.id)).toEqual(['a']);
  expect(await (await get(`network=mainnet&owner=${owner}`)).json()).toEqual({ events: [] });
});
