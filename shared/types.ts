// Shared types (spec §7.4). Owned by the orchestrator; workers request changes in their report.
export type AssetClass = 'stable' | 'gold' | 'rwa' | 'mon' | 'btc_eth' | 'other';
export type Choice<T extends string> = { value: T; confidence: number };
export type Address = `0x${string}`;

export interface Pool {
  id: string; project: string; symbol: string; assetClass: AssetClass;
  tvlUsd: number; apy: number; apyBase: number; apyReward: number;
  apyMean30d: number | null; sigma: number | null;
  realApy: number; incentiveShare: number;
  apyPct7D: number | null; // 7-day APY change, for Pulse movers
  ilRisk: boolean; exposure: 'single' | 'multi';
  maturity: string | null; underlying: string[]; meta: string | null;
}

export type VerdictLabel = 'DEPOSIT' | 'CONSIDER' | 'AVOID' | 'NOT_JUDGED';
export interface Flag { key: 'yield_source' | 'sustainable' | 'risk'; text: string; confidence?: number }
export interface Verdict {
  poolId: string; label: VerdictLabel; confidence: number;
  risk: number | null; // Jev risk score 1–5, used by the advisor
  yieldSource: 'organic' | 'incentive' | 'mixed' | null;
  band: 'high' | 'medium' | 'low'; flags: Flag[]; statsHash: string; judgedAt: string;
  source?: 'jev' | 'heuristic-placeholder';
}

export interface Intent {
  text: string; amount: number | null; asset: string | null;
  risk: Choice<'low' | 'medium' | 'high'>;
  horizon: Choice<'short' | 'medium' | 'long'>;
  assetPref: Choice<AssetClass | 'any'>;
}

export interface Recommendation {
  pool: Pool; verdict: Verdict; realApy: number; expectedReturnUsd: number;
  fitReasons: string[]; mirrorVault: Address | null; // where Deposit goes
}

export interface Holding { symbol: string; token: Address; amount: number; usd: number; assetClass: AssetClass; earning: boolean }
export interface IdleReport {
  address: Address; holdings: Holding[]; idleUsd: number;
  potentialYearlyUsd: number; suggestions: Recommendation[]; asOf: string;
}

export interface PositionJudgment {
  action: Choice<'hold' | 'exit' | 'rotate'>; withdrawalRisk: number;
  yieldCollapse: number; statsHash: string; at: string;
}
export interface Position {
  vault: Address; mirrorOf: string; shares: string; assets: string;
  apyBps: number; utilBps: number; autopilot: boolean; judgment: PositionJudgment | null;
}

export interface WatchEvent {
  id: string; at: string; vault: Address; owner?: Address;
  type: 'stats_changed' | 'judged' | 'alert' | 'exit_sent' | 'exit_confirmed' | 'exit_failed';
  message: string; txHash?: Address; confidence?: number;
}

export interface VaultStats { apyBps: number; utilBps: number }
export interface MirrorInfo { address: Address; mirrorOf: string; poolId: string | null }
