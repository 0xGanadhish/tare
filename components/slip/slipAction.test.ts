import { describe, expect, test } from 'vitest';
import { NETWORKS } from '@/shared/networks';
import { slipAction } from './slipAction';

const mirrored = NETWORKS.testnet.vaults.find((v) => v.poolId)!;

describe('slipAction', () => {
  test('Deposit when the pool maps to a vault on the current network', () => {
    expect(slipAction('testnet', mirrored.poolId!)).toEqual({ kind: 'deposit', vault: mirrored });
  });
  test('slip shows "Open on protocol" for a pool with no vault on the current network', () => {
    expect(slipAction('testnet', 'no-such-pool')).toEqual({ kind: 'open' });
    // Mainnet never offers the testnet mirrors.
    expect(slipAction('mainnet', mirrored.poolId!)).toEqual({ kind: 'open' });
  });
});
