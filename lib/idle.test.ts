import type * as Viem from 'viem';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { computeIdleReport, InvalidAddress, readHoldings, scanAddress } from './idle';
import { MAINNET_TOKENS, WMON_ADDRESS } from '../shared/tokens';
import type { Holding, Pool, Verdict } from '../shared/types';
import fixture from '../fixtures/pools.json';

const rpc = vi.hoisted(() => ({ getBytecode: vi.fn(), multicall: vi.fn(), readContract: vi.fn(), getBalance: vi.fn() }));
vi.mock('viem', async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => rpc }));
const address = '0xf70da97812cb96acdf810712aa562db8dfa3dbef';
const usdc: Holding = { symbol: 'USDC', token: MAINNET_TOKENS[0].address, amount: 10_000, usd: 10_000, assetClass: 'stable', earning: false };
const stable = { ...fixture.pools[1], id: 'best', realApy: 6.5 } as Pool;
const verdict = (p: Pool, label: Verdict['label'] = 'DEPOSIT'): Verdict => ({ poolId: p.id, label, confidence: 0.9, risk: 2, yieldSource: 'organic', band: 'high', flags: [], statsHash: '', judgedAt: '' });
beforeEach(() => {
  vi.resetAllMocks();
  rpc.getBytecode.mockResolvedValue('0x1234'); rpc.getBalance.mockResolvedValue(2n * 10n ** 18n);
  rpc.multicall.mockResolvedValue(MAINNET_TOKENS.map((t) => ({ status: 'success', result: t.symbol === 'USDC' ? 10_000n * 10n ** 6n : t.symbol === 'shMON' ? 10n ** 18n : 0n })));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ coins: {
    [`monad:${MAINNET_TOKENS[0].address}`]: { price: 1 }, [`monad:${WMON_ADDRESS}`]: { price: 2 },
    [`monad:${MAINNET_TOKENS[5].address}`]: { price: 3 },
  } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('shMON is earning and excluded from idle USD and opportunity', () => {
  const shmon: Holding = { symbol: 'shMON', token: MAINNET_TOKENS[5].address, amount: 100, usd: 200, assetClass: 'mon', earning: true };
  const report = computeIdleReport(address, [usdc, shmon], [stable], { best: verdict(stable) }, []);
  expect(report.idleUsd).toBe(10_000); expect(report.holdings[1].earning).toBe(true);
  expect(report.potentialYearlyUsd).toBe(650);
});
test('potential uses best DEPOSIT real yield in each holding asset class, never AVOID or CONSIDER', () => {
  const consider = { ...stable, id: 'consider', realApy: 100 };
  const avoid = { ...stable, id: 'avoid', realApy: 200 };
  const gold = { ...stable, id: 'gold', assetClass: 'gold' as const, realApy: 50 };
  const report = computeIdleReport(address, [usdc], [stable, consider, avoid, gold], {
    best: verdict(stable), consider: verdict(consider, 'CONSIDER'), avoid: verdict(avoid, 'AVOID'), gold: verdict(gold),
  }, []);
  expect(report.potentialYearlyUsd).toBe(650);
  expect(report.suggestions.map((r) => r.pool.id)).toEqual(['best']);
  expect(report.suggestions[0].expectedReturnUsd).toBe(650);
});
test('no same-class deposit gives zero opportunity, not another class yield', () => {
  const gold = { ...stable, assetClass: 'gold' as const };
  expect(computeIdleReport(address, [usdc], [gold], { best: verdict(gold) }, []).potentialYearlyUsd).toBe(0);
});
test('scanAddress rejects ENS, missing prefix, and wrong length before RPC', async () => {
  for (const bad of ['vitalik.eth', 'f70da97812cb96acdf810712aa562db8dfa3dbef', '0x123']) {
    await expect(scanAddress(bad)).rejects.toThrow(InvalidAddress);
  }
  expect(rpc.getBalance).not.toHaveBeenCalled();
});
test('readHoldings reads native and token balances, decimals, prices and earning flags', async () => {
  const holdings = await readHoldings(address);
  expect(holdings.find((h) => h.symbol === 'USDC')).toMatchObject({ amount: 10_000, usd: 10_000, earning: false });
  expect(holdings.find((h) => h.symbol === 'MON')).toMatchObject({ amount: 2, usd: 4, earning: false });
  expect(holdings.find((h) => h.symbol === 'shMON')).toMatchObject({ amount: 1, usd: 3, earning: true });
});
test('falls back to parallel token reads if Multicall3 has no bytecode', async () => {
  rpc.getBytecode.mockResolvedValue('0x');
  rpc.readContract.mockResolvedValue(0n);
  expect((await readHoldings(address)).find((h) => h.symbol === 'MON')?.usd).toBe(4);
  expect(rpc.multicall).not.toHaveBeenCalled();
  expect(rpc.readContract).toHaveBeenCalledTimes(MAINNET_TOKENS.length);
});
test('retries a failed balance read once, without silently treating it as zero', async () => {
  rpc.multicall.mockRejectedValueOnce(new Error('RPC unavailable'));
  expect((await readHoldings(address)).find((h) => h.symbol === 'USDC')?.usd).toBe(10_000);
  expect(rpc.multicall).toHaveBeenCalledTimes(2);
});
test('failed token result is retried, then rejects if still unavailable', async () => {
  rpc.multicall.mockResolvedValue([{ status: 'failure', error: new Error('balance failed') }]);
  await expect(readHoldings(address)).rejects.toThrow('balance');
  expect(rpc.multicall).toHaveBeenCalledTimes(2);
});
test('price HTTP failures retry once and then reject', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  await expect(readHoldings(address)).rejects.toThrow('503');
  expect(fetch).toHaveBeenCalledTimes(2);
});
