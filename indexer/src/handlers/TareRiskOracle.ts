import { TareRiskOracle } from 'generated';
import { lower, verdictId } from '../ids';

const VERDICTS = ['HOLD', 'EXIT', 'MOVE'] as const;

TareRiskOracle.VerdictPosted.handler(async ({ event, context }) => {
  const verdict = VERDICTS[Number(event.params.verdict)];
  if (!verdict) {
    context.log.error(`VerdictPosted ${event.params.id}: unknown verdict ${event.params.verdict}`);
    return;
  }
  context.Verdict.set({
    id: verdictId(event.chainId, event.params.id),
    chainId: event.chainId,
    postId: event.params.id,
    vault: lower(event.params.vault),
    verdict,
    confidenceBps: Number(event.params.confidenceBps),
    riskBps: Number(event.params.riskBps),
    stateHash: event.params.stateHash,
    postedAt: event.params.postedAt,
    txHash: event.transaction.hash,
    resolved: false,
    adverse: undefined,
    reasons: undefined,
    resolvedAt: undefined,
  });
});

TareRiskOracle.VerdictResolved.handler(async ({ event, context }) => {
  const id = verdictId(event.chainId, event.params.id);
  const existing = await context.Verdict.get(id);
  if (!existing) {
    // The oracle only resolves ids it posted, so this means the start block is wrong.
    context.log.error(`VerdictResolved for unknown verdict ${id}`);
    return;
  }
  context.Verdict.set({
    ...existing,
    resolved: true,
    adverse: event.params.adverse,
    reasons: Number(event.params.reasons),
    resolvedAt: BigInt(event.block.timestamp),
  });
});
