import type { Chain } from 'viem';
import { monadMainnet, monadTestnet } from './chains';
import type { Address } from './types';
import testnetAddresses from './addresses.testnet.json';
import mainnetAddresses from './addresses.mainnet.json';

export type Network = 'testnet' | 'mainnet';
export const NETWORK_IDS: readonly Network[] = ['testnet', 'mainnet'];

export interface VaultConfig {
  address: Address; name: string; poolId: string | null;
  protocol: 'mirror' | 'euler' | 'morpho'; adapter: Address | null;
}

export interface NetworkConfig {
  network: Network; chain: Chain; usdc: Address; oracle: Address; guardian: Address;
  vaults: VaultConfig[]; explorer: string; deployBlock: bigint;
  features: { faucet: boolean; demoControls: boolean; launch: boolean; softCapUsd: number | null };
}

/** Real USDC on Monad mainnet (monskills addresses list). */
export const MAINNET_USDC: Address = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
/** Placeholder until DeployV2 writes the oracle and GuardianV2 addresses (plan Task 6). */
export const UNDEPLOYED: Address = '0x0000000000000000000000000000000000000000';
export const MAINNET_SOFT_CAP_USD = 1000;

// Shape DeployV2 writes next to the v1 fields; every v2 field is optional until that deploy has run.
interface AddressFile {
  mockUsdc?: string; usdc?: string; oracle?: string; guardianV2?: string; deployBlockV2?: number | string;
  mirrors?: { address: string; mirrorOf: string; poolId: string | null }[];
  vaults?: { address: string; name: string; poolId: string | null; protocol: VaultConfig['protocol']; adapter: string | null }[];
}

function vaultsFrom(file: AddressFile, mirrorsAsFallback: boolean): VaultConfig[] {
  if (file.vaults) return file.vaults.map((v) => ({ ...v, address: v.address as Address, adapter: (v.adapter as Address | null) ?? null }));
  if (!mirrorsAsFallback) return [];
  return (file.mirrors ?? []).map((m) => ({ address: m.address as Address, name: m.mirrorOf, poolId: m.poolId, protocol: 'mirror', adapter: null }));
}

const testnet = testnetAddresses as AddressFile;
const mainnet = mainnetAddresses as AddressFile;

export const NETWORKS: Record<Network, NetworkConfig> = {
  testnet: {
    network: 'testnet', chain: monadTestnet,
    usdc: (testnet.usdc ?? testnet.mockUsdc ?? UNDEPLOYED) as Address,
    oracle: (testnet.oracle ?? UNDEPLOYED) as Address,
    guardian: (testnet.guardianV2 ?? UNDEPLOYED) as Address,
    vaults: vaultsFrom(testnet, true),
    explorer: 'https://testnet.monadvision.com',
    deployBlock: BigInt(testnet.deployBlockV2 ?? 0),
    features: { faucet: true, demoControls: true, launch: true, softCapUsd: null },
  },
  mainnet: {
    network: 'mainnet', chain: monadMainnet,
    usdc: MAINNET_USDC,
    oracle: (mainnet.oracle ?? UNDEPLOYED) as Address,
    guardian: (mainnet.guardianV2 ?? UNDEPLOYED) as Address,
    // Mainnet mirrors hold the demo token, so they are never depositable here.
    vaults: vaultsFrom(mainnet, false).filter((v) => v.protocol !== 'mirror'),
    explorer: 'https://monadvision.com',
    deployBlock: BigInt(mainnet.deployBlockV2 ?? 0),
    features: { faucet: false, demoControls: false, launch: false, softCapUsd: MAINNET_SOFT_CAP_USD },
  },
};

export const isNetwork = (value: unknown): value is Network => value === 'testnet' || value === 'mainnet';

export function vaultForPool(network: Network, poolId: string): VaultConfig | null {
  return NETWORKS[network].vaults.find((v) => v.poolId === poolId) ?? null;
}
