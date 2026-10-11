import type { Hex } from 'viem';
import type { VaultConfig } from '../shared/networks';

/** Client-safe position types (no RPC or Node imports), shared by lib/positions.ts and the Watch page. */
export type OracleVerdictLabel = 'HOLD' | 'EXIT' | 'MOVE';
export const VERDICT_LABEL: OracleVerdictLabel[] = ['HOLD', 'EXIT', 'MOVE'];

export interface PositionV2 {
  vault: VaultConfig;
  shares: bigint;
  assets: bigint;
  rule: { enabled: boolean; minConfidenceBps: number; maxAge: number } | null;
  /** Latest onchain verdict for the vault. `txHash` comes from the backend and is null while it is unreachable. */
  latest: { id: string; verdict: OracleVerdictLabel; confidenceBps: number; postedAt: number; txHash: Hex | null; stateUrl: string | null } | null;
}

/** JSON-safe form for the API route (bigints as decimal strings). */
export type PositionV2Json = Omit<PositionV2, 'shares' | 'assets'> & { shares: string; assets: string };
export const toJson = (p: PositionV2): PositionV2Json => ({ ...p, shares: p.shares.toString(), assets: p.assets.toString() });
export const fromJson = (p: PositionV2Json): PositionV2 => ({ ...p, shares: BigInt(p.shares), assets: BigInt(p.assets) });
