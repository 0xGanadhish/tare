import { createPublicClient, http, isAddress } from 'viem';
import { monadTestnet, MULTICALL3 } from '../shared/chains';
import { abis, addresses } from '../shared/contracts';
import { readEvents } from '../shared/cache';
import type { Address, Position, PositionJudgment, WatchEvent } from '../shared/types';
import { InvalidAddress } from './idle';

function completeJudgment(value: unknown): value is PositionJudgment {
  if (!value || typeof value !== 'object') return false;
  const j = value as Partial<PositionJudgment>;
  const probability = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  return !!j.action && ['hold', 'exit', 'rotate'].includes(j.action.value) && probability(j.action.confidence)
    && probability(j.withdrawalRisk) && probability(j.yieldCollapse)
    && typeof j.statsHash === 'string' && typeof j.at === 'string';
}

function latestJudgment(events: WatchEvent[], vault: Address, owner: Address): PositionJudgment | null {
  let latest: WatchEvent | undefined;
  for (const event of events) {
    if (event.type !== 'judged' || event.vault.toLowerCase() !== vault.toLowerCase()
      || (event.owner && event.owner.toLowerCase() !== owner.toLowerCase())) continue;
    if (!latest || event.at >= latest.at) latest = event;
  }
  // Never invent a full judgment from rounded display text. Stream A must persist the typed payload.
  const judgment = (latest as (WatchEvent & { judgment?: unknown }) | undefined)?.judgment;
  return completeJudgment(judgment) ? judgment : null;
}

export async function readPositions(owner: Address): Promise<Position[]> {
  if (!isAddress(owner)) throw new InvalidAddress();
  const mirrors = addresses.mirrors ?? [];
  if (mirrors.length === 0) return [];
  // Multicall3 verified on testnet; batch view calls to avoid the public RPC's 15 requests/sec cap.
  const client = createPublicClient({
    chain: { ...monadTestnet, contracts: { multicall3: { address: MULTICALL3 } } },
    batch: { multicall: true }, transport: http(),
  });
  const events = await readEvents();
  const positions = await Promise.all(mirrors.map(async (mirror): Promise<Position | null> => {
    const vault = mirror.address;
    const shares = await client.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'balanceOf', args: [owner] });
    if (shares === 0n) return null;
    const [assets, apyBps, utilBps, autopilot] = await Promise.all([
      client.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'convertToAssets', args: [shares] }),
      client.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'apyBps' }),
      client.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'utilizationBps' }),
      addresses.guardian ? client.readContract({ address: addresses.guardian, abi: abis.guardian, functionName: 'enabled', args: [owner, vault] }) : false,
    ]);
    return { vault, mirrorOf: mirror.mirrorOf, shares: shares.toString(), assets: assets.toString(), apyBps, utilBps,
      autopilot, judgment: latestJudgment(events, vault, owner) };
  }));
  return positions.filter((position): position is Position => position !== null);
}
