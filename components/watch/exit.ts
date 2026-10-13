/** What "Exit now" can redeem: ERC-4626 reverts above maxRedeem, so a partly locked vault redeems only what it allows. */
export function exitPlan(shares: bigint, maxRedeem: bigint): { shares: bigint; locked: bigint } {
  const now = maxRedeem < shares ? maxRedeem : shares;
  return { shares: now, locked: shares - now };
}
