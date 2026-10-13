import { createPublicClient, http, isAddress, type PublicClient } from 'viem';
import { abis } from '../shared/contracts';
import { NETWORKS, UNDEPLOYED, type Network, type NetworkConfig } from '../shared/networks';
import type { Address } from '../shared/types';
import { VERDICT_LABEL, type PositionV2 } from './positionTypes';
import { serverBackend, type Backend } from './backend';
import { InvalidAddress } from './idle';
import { stateUrl } from './stateUrl';

export type { OracleVerdictLabel, PositionV2, PositionV2Json } from './positionTypes';
export { toJson, fromJson } from './positionTypes';

export interface PositionDeps {
  config: NetworkConfig;
  client: Pick<PublicClient, 'readContract' | 'simulateContract'>;
  backend: Pick<Backend, 'latest'> | null;
  /** Public R2 base for archived state documents ("what Jev saw"). */
  stateBaseUrl: string | null;
}


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

/**
 * Shares the owner can redeem right now. Real vaults under-report maxRedeem (Morpho Vault V2 always
 * returns 0; Euler Earn returns one share short), so try the full balance first, like GuardianV2.exit.
 */
async function redeemableShares(client: PositionDeps['client'], vault: Address, owner: Address, shares: bigint): Promise<bigint> {
  try {
    await client.simulateContract({ address: vault, abi: abis.erc4626, functionName: 'redeem', args: [shares, owner, owner], account: owner });
    return shares;
  } catch {
    return client.readContract({ address: vault, abi: abis.erc4626, functionName: 'maxRedeem', args: [owner] });
  }
}

/** The owner's positions in the network's Tare vaults, with their Guardian rule and the latest onchain verdict. */
export async function readPositions(network: Network, owner: Address, deps: PositionDeps = defaultDeps(network)): Promise<PositionV2[]> {
  if (!isAddress(owner)) throw new InvalidAddress();
  const { client, config } = deps;
  const positions = await Promise.all(config.vaults.map(async (vault): Promise<PositionV2 | null> => {
    const shares = await client.readContract({ address: vault.address, abi: abis.erc4626, functionName: 'balanceOf', args: [owner] });
    if (shares === 0n) return null;
    const [assets, redeemable, rule, latest] = await Promise.all([
      client.readContract({ address: vault.address, abi: abis.erc4626, functionName: 'convertToAssets', args: [shares] }),
      redeemableShares(client, vault.address, owner, shares),
      config.guardian === UNDEPLOYED
        ? null
        : client.readContract({ address: config.guardian, abi: abis.guardianV2, functionName: 'rules', args: [owner, vault.address] }),
      latestVerdict(deps, network, vault.address),
    ]);
    return {
      vault, shares, assets, redeemable,
      rule: rule ? { enabled: rule[0], minConfidenceBps: rule[1], maxAge: rule[2] } : null,
      latest,
    };
  }));
  return positions.filter((p): p is PositionV2 => p !== null);
}
