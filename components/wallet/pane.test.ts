import { expect, test } from 'vitest';
import { NETWORKS } from '@/shared/networks';
import { activeRules, fmtUnits, myLaunches, recentActivity, usdcLabel } from './pane';

const me = '0x52b10000000000000000000000000000000Af3f0' as const;
const other = '0x00000000000000000000000000000000000000b2' as const;

test('usdcLabel calls testnet USDC "test USDC" and mainnet USDC "USDC"', () => {
  expect(usdcLabel('testnet')).toBe('test USDC');
  expect(usdcLabel('mainnet')).toBe('USDC');
});

test('myLaunches keeps only tokens the owner created, newest first, ignoring address case', () => {
  const launches = [
    { token: '0x0000000000000000000000000000000000000001', creator: me.toLowerCase() as `0x${string}`, reserveVault: other, name: 'One', symbol: 'ONE' },
    { token: '0x0000000000000000000000000000000000000002', creator: other, reserveVault: other, name: 'Two', symbol: 'TWO' },
    { token: '0x0000000000000000000000000000000000000003', creator: me, reserveVault: other, name: 'Three', symbol: 'THR' },
  ] as const;
  expect(myLaunches(launches, me).map((l) => l.symbol)).toEqual(['THR', 'ONE']);
  expect(myLaunches(undefined, me)).toEqual([]);
});

test('activeRules lists enabled rules per vault and skips disabled or failed reads', () => {
  const vaults = [
    { address: '0x0000000000000000000000000000000000000a01', name: 'A', poolId: null, protocol: 'euler', adapter: null },
    { address: '0x0000000000000000000000000000000000000a02', name: 'B', poolId: null, protocol: 'morpho', adapter: null },
    { address: '0x0000000000000000000000000000000000000a03', name: 'C', poolId: null, protocol: 'morpho', adapter: null },
  ] as const;
  const results = [
    { status: 'success' as const, result: [true, 9000, 600, 1n] as const },
    { status: 'success' as const, result: [false, 0, 0, 0n] as const },
    { status: 'failure' as const, error: new Error('rpc') },
  ];
  expect(activeRules([...vaults], results)).toEqual([{ vault: vaults[0], minConfidenceBps: 9000, maxAge: 600 }]);
  expect(activeRules([...vaults], undefined)).toEqual([]);
});

test('recentActivity sorts newest first and caps the list', () => {
  const ev = (id: string, at: string) => ({ id, at, vault: other, type: 'alert', message: 'm', txHash: null, confidence: null });
  const out = recentActivity([ev('a', '2026-10-13T10:00:00Z'), ev('b', '2026-10-13T12:00:00Z'), ev('c', '2026-10-13T11:00:00Z')], 2);
  expect(out.map((e) => e.id)).toEqual(['b', 'c']);
});

test('fmtUnits formats raw token amounts with grouping and a dash when unknown', () => {
  expect(fmtUnits(1_234_567_890n, 6)).toBe('1,234.57');
  expect(fmtUnits(1_500_000_000_000_000_000n, 18, 4)).toBe('1.5');
  expect(fmtUnits(undefined, 6)).toBe('–');
});

test('mainnet never offers Launch (guards the pane section)', () => {
  expect(NETWORKS.mainnet.features.launch).toBe(false);
});
