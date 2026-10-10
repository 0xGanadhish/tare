import type { AssetClass } from '@/shared/types';

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  stable: 'Stablecoins',
  gold: 'Gold',
  rwa: 'Real-world assets',
  mon: 'MON',
  btc_eth: 'BTC / ETH',
  other: 'Other',
};

export const exploreHref = (params: Record<string, string>) =>
  `/app/explore?${new URLSearchParams(params).toString()}`;

/** Signed percent with thousands separators: +9.7%, −456.0%. */
export function formatSigned(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0.0%';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}${abs}%`;
}
