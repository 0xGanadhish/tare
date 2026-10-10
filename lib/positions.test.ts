import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PositionJudgment } from '../shared/types';
import type * as Viem from 'viem';
import type * as Contracts from '../shared/contracts';

const state = vi.hoisted(() => ({
  addresses: {} as { mirrors?: { address: `0x${string}`; mirrorOf: string; poolId: null }[]; guardian?: `0x${string}` },
  readContract: vi.fn(), readEvents: vi.fn(),
}));
vi.mock('viem', async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => ({ readContract: state.readContract }) }));
vi.mock('../shared/contracts', async (original) => ({ ...await original<typeof Contracts>(), addresses: state.addresses }));
vi.mock('../shared/cache', () => ({ readEvents: state.readEvents }));
import { readPositions } from './positions';

const owner = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';
const guardian = '0x3333333333333333333333333333333333333333';
const judgment: PositionJudgment = { action: { value: 'exit', confidence: 0.93 }, withdrawalRisk: 0.92, yieldCollapse: 0.8, statsHash: 'jev-stats-hash', at: '2026-10-10T01:00:00Z' };
beforeEach(() => {
  state.addresses.mirrors = [{ address: vault, mirrorOf: 'Test mirror', poolId: null }];
  state.addresses.guardian = guardian;
  state.readEvents.mockResolvedValue([]);
  state.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    return { balanceOf: 9007199254740993123n, convertToAssets: 9999999999999999999n,
      apyBps: 630, utilizationBps: 7100, enabled: true }[functionName];
  });
});
afterEach(() => vi.clearAllMocks());

test.each(['vitalik.eth', '1111111111111111111111111111111111111111', '0x123'])('rejects invalid owner %s before any RPC', async (address) => {
  await expect(readPositions(address as `0x${string}`)).rejects.toThrow('Not a valid Monad address');
  expect(state.readContract).not.toHaveBeenCalled();
});
test('empty deployment produces no positions without touching RPC', async () => {
  delete state.addresses.mirrors;
  delete state.addresses.guardian;
  expect(await readPositions(owner)).toEqual([]);
  expect(state.readContract).not.toHaveBeenCalled();
});
test('keeps exact chain quantities and latest complete judgment for this owner/vault', async () => {
  state.readEvents.mockResolvedValue([
    { id: 'old', type: 'judged', vault, at: '2026-10-10T00:00:00Z', judgment: { ...judgment, action: { value: 'hold', confidence: 0.7 } } },
    { id: 'new', type: 'judged', vault: vault.toUpperCase(), owner, at: judgment.at, judgment },
    { id: 'other-owner', type: 'judged', vault, owner: guardian, at: '2026-10-10T02:00:00Z', judgment: { ...judgment, action: { value: 'rotate', confidence: 0.8 } } },
  ]);
  expect(await readPositions(owner)).toEqual([{ vault, mirrorOf: 'Test mirror', shares: '9007199254740993123',
    assets: '9999999999999999999', apyBps: 630, utilBps: 7100, autopilot: true, judgment }]);
  expect(state.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: guardian, functionName: 'enabled', args: [owner, vault] }));
});
test('zero-share vaults are excluded from positions', async () => {
  state.readContract.mockResolvedValue(0n);
  expect(await readPositions(owner)).toEqual([]);
});
test('missing Guardian disables autopilot; message-only judgments remain unknown', async () => {
  delete state.addresses.guardian;
  state.readEvents.mockResolvedValue([{ type: 'judged', vault, at: judgment.at, confidence: 0.93,
    message: 'Jev: exit (93%) · withdrawal risk 0.92 · yield collapse 0.80' }]);
  expect((await readPositions(owner))[0]).toMatchObject({ autopilot: false, judgment: null });
});
