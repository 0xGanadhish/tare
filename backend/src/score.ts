// Stub until shared/score.ts lands (plan Tasks 8 and 21); same signature, so the swap is an import change.
export interface LedgerScore { n: number; brier: number | null; early: boolean; bands: { band: string; n: number; hitRate: number }[] }
export interface ScoredPost { confidenceBps: number; riskBps: number; resolved: boolean; adverse: boolean | null }

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub keeps the final signature
export function scoreLedger(posts: ScoredPost[]): LedgerScore {
  return { n: 0, brier: null, early: true, bands: [] };
}
