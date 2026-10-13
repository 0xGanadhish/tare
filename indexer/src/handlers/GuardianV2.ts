import { GuardianV2 } from 'generated';
import { logId, lower, protectionId, verdictId } from '../ids';

GuardianV2.Enabled.handler(async ({ event, context }) => {
  context.Protection.set({
    id: protectionId(event.chainId, event.params.owner, event.params.vault),
    chainId: event.chainId,
    owner: lower(event.params.owner),
    vault: lower(event.params.vault),
    enabled: true,
    minConfidenceBps: Number(event.params.minConfidenceBps),
    maxAge: Number(event.params.maxAge),
    updatedAt: BigInt(event.block.timestamp),
  });
});

GuardianV2.Disabled.handler(async ({ event, context }) => {
  const id = protectionId(event.chainId, event.params.owner, event.params.vault);
  const existing = await context.Protection.get(id);
  // Keep the last rule's numbers so the app can show what was switched off.
  context.Protection.set({
    id,
    chainId: event.chainId,
    owner: lower(event.params.owner),
    vault: lower(event.params.vault),
    minConfidenceBps: existing?.minConfidenceBps ?? 0,
    maxAge: existing?.maxAge ?? 0,
    enabled: false,
    updatedAt: BigInt(event.block.timestamp),
  });
});

GuardianV2.Exited.handler(async ({ event, context }) => {
  context.Exit.set({
    id: logId(event.chainId, event.transaction.hash, event.logIndex),
    chainId: event.chainId,
    owner: lower(event.params.owner),
    vault: lower(event.params.vault),
    verdict_id: verdictId(event.chainId, event.params.verdictId),
    caller: lower(event.params.caller),
    shares: event.params.shares,
    assets: event.params.assets,
    remainingShares: event.params.remainingShares,
    txHash: event.transaction.hash,
    at: BigInt(event.block.timestamp),
  });
});
