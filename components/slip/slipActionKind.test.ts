import { describe, expect, test } from 'vitest';
import { NETWORKS } from '@/shared/networks';
import { slipAction } from './slipActionKind';

const mirrored = NETWORKS.testnet.vaults.find((v) => v.poolId)!;

describe('slipAction', () => {
  test('Deposit when the pool maps to a vault on the current network', () => {
    expect(slipAction('testnet', mirrored.poolId!)).toEqual({ kind: 'deposit', vault: mirrored });
  });
  test('slip offers no deposit for a pool with no vault on the current network', () => {
    expect(slipAction('testnet', 'no-such-pool')).toEqual({ kind: 'open' });
  });
  test('mainnet never offers a testnet mirror, only the real vault for the same pool', () => {
    for (const m of NETWORKS.testnet.vaults.filter((v) => v.poolId)) {
      const real = NETWORKS.mainnet.vaults.find((v) => v.poolId === m.poolId);
      expect(slipAction('mainnet', m.poolId!)).toEqual(real ? { kind: 'deposit', vault: real } : { kind: 'open' });
      expect(real?.address).not.toBe(m.address);
    }
  });
});
