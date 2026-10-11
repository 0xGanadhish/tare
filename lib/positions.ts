import { createPublicClient, http, isAddress, type Hex, type PublicClient } from 'viem';
import { abis } from '../shared/contracts';
import { NETWORKS, UNDEPLOYED, type Network, type NetworkConfig, type VaultConfig } from '../shared/networks';
import type { Address } from '../shared/types';
import { serverBackend, type Backend } from './backend';
import { InvalidAddress } from './idle';

export type OracleVerdictLabel = 'HOLD' | 'EXIT' | 'MOVE';
const VERDICT_LABEL: OracleVerdictLabel[] = ['HOLD', 'EXIT', 'MOVE'];

export interface PositionV2 {
  vault: VaultConfig;
  shares: bigint;
  assets: bigint;
  rule: { enabled: boolean; minConfidenceBps: number; maxAge: number } | null;
  /** Latest onchain verdict for the vault. `txHash` comes from the backend and is null while it is unreachable. */
  latest: { id: string; verdict: OracleVerdictLabel; confidenceBps: number; postedAt: number; txHash: Hex | null; stateUrl: string | null } | null;
}

export interface PositionDeps {
  config: NetworkConfig;
  client: Pick<PublicClient, 'readContract'>;
  backend: Pick<Backend, 'latest'> | null;
  /** Public R2 base for archived state documents ("what Jev saw"). */
  stateBaseUrl: string | null;
}

export const stateUrl = (base: string | null, hash: string): string | null => (base ? `${base.replace(/\/+$/, '')}/state/${hash}.json` : null);

function defaultDeps(network: Network): PositionDeps {
  const config = NETWORKS[network];
  return {
    config,
    // Multicall3 batches the view calls under the public RPC's request cap.
    client: createPublicClient({ chain: config.chain, batch: { multicall: true }, transport: http() }),
    backend: serverBackend(),
    stateBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL || null,
  };
}

async function latestVerdict(deps: PositionDeps, network: Network, vault: Address): Promise<PositionV2['latest']> {
  const { client, config } = deps;
  if (config.oracle === UNDEPLOYED) return null;
  const id = await client.readContract({ address: config.oracle, abi: abis.oracle, functionName: 'latest', args: [vault] });
  if (id === 0n) return null;
  const post = await client.readContract({ address: config.oracle, abi: abis.oracle, functionName: 'getPost', args: [id] });
  const indexed = await deps.backend?.latest(network, vault).catch(() => null);
  return {
    id: id.toString(),
    verdict: VERDICT_LABEL[post.verdict] ?? 'HOLD',
    confidenceBps: post.confidenceBps,
    postedAt: Number(post.postedAt),
    txHash: indexed && String(indexed.id) === id.toString() ? indexed.txHash : null,
    stateUrl: stateUrl(deps.stateBaseUrl, post.stateHash),
  };
}

/** The owner's positions in the network's Tare vaults, with their Guardian rule and the latest onchain verdict. */
export async function readPositions(network: Network, owner: Address, deps: PositionDeps = defaultDeps(network)): Promise<PositionV2[]> {
  if (!isAddress(owner)) throw new InvalidAddress();
  const { client, config } = deps;
  const positions = await Promise.all(config.vaults.map(async (vault): Promise<PositionV2 | null> => {
    const shares = await client.readContract({ address: vault.address, abi: abis.erc4626, functionName: 'balanceOf', args: [owner] });
    if (shares === 0n) return null;
    const [assets, rule, latest] = await Promise.all([
      client.readContract({ address: vault.address, abi: abis.erc4626, functionName: 'convertToAssets', args: [shares] }),
      config.guardian === UNDEPLOYED
        ? null
        : client.readContract({ address: config.guardian, abi: abis.guardianV2, functionName: 'rules', args: [owner, vault.address] }),
      latestVerdict(deps, network, vault.address),
    ]);
    return {
      vault, shares, assets,
      rule: rule ? { enabled: rule[0], minConfidenceBps: rule[1], maxAge: rule[2] } : null,
      latest,
    };
  }));
  return positions.filter((p): p is PositionV2 => p !== null);
}

/** JSON-safe form for the API route (bigints as decimal strings). */
export type PositionV2Json = Omit<PositionV2, 'shares' | 'assets'> & { shares: string; assets: string };
export const toJson = (p: PositionV2): PositionV2Json => ({ ...p, shares: p.shares.toString(), assets: p.assets.toString() });
export const fromJson = (p: PositionV2Json): PositionV2 => ({ ...p, shares: BigInt(p.shares), assets: BigInt(p.assets) });
