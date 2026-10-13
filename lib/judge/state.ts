import { formatUnits } from 'viem';
import { MAINNET_TOKENS } from '../../shared/tokens';
import type { Pool, Position, VaultStats } from '../../shared/types';

export interface Flows { netOutUsd: number; netOutPctTvl: number; largestOutUsd: number }

export interface PositionInput {
  position: Position;
  atDeposit: VaultStats;
  alternative: { name: string; realApy: number } | null;
  protocolName: string;
  isMirror: boolean;
  flows: Flows | null;
  liquidityPct: number | null; // from a liquidity adapter; null means use the utilization-implied figure
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function renderPoolState(p: Pool): string {
  return `${p.project} ${p.symbol} · ${p.assetClass} · TVL $${p.tvlUsd} · headline APY ${p.apy}%: `
    + `base ${p.apyBase}%, rewards ${p.apyReward}% (${(p.incentiveShare * 100).toFixed(2)}% of headline) · `
    + `30-day mean ${p.apyMean30d ?? 'unknown'} · 7-day APY change ${p.apyPct7D ?? 'unknown'} · `
    + `volatility ${p.sigma ?? 'unknown'} · ${p.exposure} asset, ${p.ilRisk ? 'IL risk' : 'no IL'} · `
    + `maturity ${p.maturity ?? 'none'} · underlying ${p.underlying.join(', ')} · metadata ${p.meta ?? 'none'}`;
}

export function renderPositionState({ position: p, atDeposit, alternative, protocolName, isMirror, flows, liquidityPct }: PositionInput): string {
  const token = MAINNET_TOKENS.find((t) => p.mirrorOf.toUpperCase().split(/[^A-Z0-9]+/).includes(t.symbol.toUpperCase()));
  // Rounded and address-free, as in the spec's example state: dust digits and hex add noise to Jev's read.
  const amount = token ? Number(formatUnits(BigInt(p.assets), token.decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 }) : null;
  const holding = token ? `${amount} ${token.symbol}` : `${p.assets} asset base units`;
  const liquidity = liquidityPct !== null
    ? `Withdrawable liquidity ${liquidityPct}% of vault. `
    : isMirror ? `Utilization-implied withdrawable liquidity ${Math.max(0, 100 - p.utilBps / 100)}% of vault. ` : 'Withdrawable liquidity unknown. ';
  const flowText = flows
    ? `Last hour: net outflow ${usd(flows.netOutUsd)} (${flows.netOutPctTvl}% of TVL), largest single withdrawal ${usd(flows.largestOutUsd)}. `
    : 'Last hour: flow data unavailable. ';
  return `Holding ${holding} in ${p.mirrorOf} ${isMirror ? '(mirror)' : `(${protocolName})`}. `
    + `APY at deposit ${atDeposit.apyBps / 100}%, now ${p.apyBps / 100}%. `
    + (isMirror ? `Utilization ${p.utilBps / 100}% (was ${atDeposit.utilBps / 100}%). ` : '')
    + liquidity + flowText
    + (alternative ? `Best same-risk alternative: ${alternative.name} at ${alternative.realApy}%.` : 'No same-risk alternative available.');
}
