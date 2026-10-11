import { ERC4626Vault, type VaultFlowHour, type VaultState } from 'generated';
import { readTotalAssets } from '../effects';
import { applyFlow, isLargeWithdrawal } from '../flows';
import { hourOf, logId, lower, vaultKey } from '../ids';

type Ctx = Parameters<Parameters<typeof ERC4626Vault.Deposit.handler>[0]>[0]['context'];

async function vaultState(context: Ctx, chainId: number, vault: string): Promise<VaultState> {
  const id = vaultKey(chainId, vault);
  const existing = await context.VaultState.get(id);
  if (existing) return existing;
  const baseline = await context.effect(readTotalAssets, { chainId, vault: lower(vault) });
  return { id, chainId, vault: lower(vault), trackedAssets: baseline ? BigInt(baseline) : 0n, baselineFromRpc: baseline !== null };
}

async function flowHour(context: Ctx, chainId: number, vault: string, timestamp: number): Promise<VaultFlowHour> {
  const hourTs = hourOf(timestamp);
  const id = `${vaultKey(chainId, vault)}-${hourTs}`;
  return (
    (await context.VaultFlowHour.get(id)) ?? {
      id,
      chainId,
      vault: lower(vault),
      hourTs: BigInt(hourTs),
      inAssets: 0n,
      outAssets: 0n,
      largestOut: 0n,
    }
  );
}

ERC4626Vault.Deposit.handler(async ({ event, context }) => {
  const { assets } = event.params;
  const state = await vaultState(context, event.chainId, event.srcAddress);
  const hour = await flowHour(context, event.chainId, event.srcAddress, event.block.timestamp);
  context.VaultFlowHour.set({ ...hour, inAssets: hour.inAssets + assets });
  context.VaultState.set({ ...state, trackedAssets: applyFlow(state.trackedAssets, assets) });
});

ERC4626Vault.Withdraw.handler(async ({ event, context }) => {
  const { assets } = event.params;
  const state = await vaultState(context, event.chainId, event.srcAddress);
  const hour = await flowHour(context, event.chainId, event.srcAddress, event.block.timestamp);
  context.VaultFlowHour.set({
    ...hour,
    outAssets: hour.outAssets + assets,
    largestOut: assets > hour.largestOut ? assets : hour.largestOut,
  });
  if (isLargeWithdrawal(assets, state.trackedAssets)) {
    context.LargeWithdrawal.set({
      id: logId(event.chainId, event.transaction.hash, event.logIndex),
      chainId: event.chainId,
      vault: lower(event.srcAddress),
      owner: lower(event.params.owner),
      assets,
      at: BigInt(event.block.timestamp),
    });
  }
  context.VaultState.set({ ...state, trackedAssets: applyFlow(state.trackedAssets, -assets) });
});
