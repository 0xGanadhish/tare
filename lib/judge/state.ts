import { formatUnits } from 'viem';
import { MAINNET_TOKENS } from '../../shared/tokens';
import type { Pool, Position, VaultStats } from '../../shared/types';

export interface PositionInput {
  position: Position;
  atDeposit: VaultStats;
  alternative: { name: string; realApy: number } | null;
}

export function renderPoolState(p: Pool): string {
  return `${p.project} ${p.symbol} · ${p.assetClass} · TVL $${p.tvlUsd} · headline APY ${p.apy}%: `
    + `base ${p.apyBase}%, rewards ${p.apyReward}% (${(p.incentiveShare * 100).toFixed(2)}% of headline) · `
    + `30-day mean ${p.apyMean30d ?? 'unknown'} · 7-day APY change ${p.apyPct7D ?? 'unknown'} · `
    + `volatility ${p.sigma ?? 'unknown'} · ${p.exposure} asset, ${p.ilRisk ? 'IL risk' : 'no IL'} · `
    + `maturity ${p.maturity ?? 'none'} · underlying ${p.underlying.join(', ')} · metadata ${p.meta ?? 'none'}`;
}

export function renderPositionState({ position: p, atDeposit, alternative }: PositionInput): string {
  const token = MAINNET_TOKENS.find((t) => p.mirrorOf.toUpperCase().split(/[^A-Z0-9]+/).includes(t.symbol.toUpperCase()));
  // Rounded and address-free, as in the spec's example state: dust digits and hex add noise to Jev's read.
  const amount = token ? Number(formatUnits(BigInt(p.assets), token.decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 }) : null;
  const holding = token ? `${amount} ${token.symbol}` : `${p.assets} asset base units`;
  return `Holding ${holding} in ${p.mirrorOf} (mirror). `
    + `APY at deposit ${atDeposit.apyBps / 100}%, now ${p.apyBps / 100}%. `
    + `Utilization ${p.utilBps / 100}% (was ${atDeposit.utilBps / 100}%). `
    + `Utilization-implied withdrawable liquidity ${Math.max(0, 100 - p.utilBps / 100)}% of vault. `
    + (alternative ? `Best same-risk alternative: ${alternative.name} at ${alternative.realApy}%.` : 'No same-risk alternative available.');
}
