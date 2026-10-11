import { keccak256, toBytes, type Hex } from 'viem';
import type { Network } from './networks';
import type { Address, PositionJudgment } from './types';

/** Mirrors `TareRiskOracle.Verdict`. */
export enum OracleVerdict { HOLD = 0, EXIT = 1, MOVE = 2 }

const ACTION_TO_VERDICT = { hold: OracleVerdict.HOLD, exit: OracleVerdict.EXIT, rotate: OracleVerdict.MOVE } as const;
const toBps = (p: number) => Math.min(10_000, Math.max(0, Math.round(p * 10_000)));

export function toOraclePost(j: PositionJudgment): { verdict: OracleVerdict; confidenceBps: number; riskBps: number } {
  return { verdict: ACTION_TO_VERDICT[j.action.value], confidenceBps: toBps(j.action.confidence), riskBps: toBps(j.withdrawalRisk) };
}

/** Everything Jev saw and said for one verdict; archived publicly, and its hash is posted onchain. */
export interface StateDocument {
  v: 1; network: Network; vault: Address; state: string; questions: unknown; answers: unknown;
  model: string; at: string; drill: boolean;
}

/** JSON with object keys sorted at every depth, so the hash does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stateHash(doc: StateDocument): Hex {
  return keccak256(toBytes(canonicalJson(doc)));
}
