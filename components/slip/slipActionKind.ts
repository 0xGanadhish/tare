import { vaultForPool, type Network, type VaultConfig } from '@/shared/networks';

export type SlipAction = { kind: 'deposit'; vault: VaultConfig } | { kind: 'open' };

/** Verdict slip action (spec §8.2): Deposit when the pool maps to a depositable vault on the network, else "Open on protocol". */
export function slipAction(network: Network, poolId: string): SlipAction {
  const vault = vaultForPool(network, poolId);
  return vault ? { kind: 'deposit', vault } : { kind: 'open' };
}
