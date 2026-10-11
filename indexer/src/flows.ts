// Pure flow arithmetic, kept out of the handlers so the rules are easy to read and test.

/** A withdrawal is large at >= 1% of the vault's assets just before it (spec §6). */
export const LARGE_WITHDRAWAL_BPS = 100n;

export function isLargeWithdrawal(assets: bigint, trackedAssetsBefore: bigint): boolean {
  // With nothing tracked yet there is no TVL to compare against, so nothing is flagged.
  if (trackedAssetsBefore <= 0n) return false;
  return assets * 10_000n >= trackedAssetsBefore * LARGE_WITHDRAWAL_BPS;
}

/** Tracked assets never go negative: flows-only tracking can see a withdrawal of TVL it never saw arrive. */
export const applyFlow = (tracked: bigint, delta: bigint) => (tracked + delta < 0n ? 0n : tracked + delta);
