import { NETWORKS, vaultForPool, type Network } from '@/shared/networks';
import type { AssetClass, Intent, Recommendation } from '@/shared/types';

const HORIZON: Record<Intent['horizon']['value'], string> = { short: '1 month', medium: '3 months', long: 'a year' };
const RISK: Record<Intent['risk']['value'], string> = { low: 'safe', medium: 'balanced', high: 'aggressive' };
const MAX_RISK: Record<Intent['risk']['value'], number | null> = { low: 2, medium: 3, high: null };
const ASSET: Record<AssetClass, string> = { stable: 'stablecoin', gold: 'gold', rwa: 'real-world asset', mon: 'MON', btc_eth: 'BTC/ETH', other: 'other asset' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-12-17" → "17 Dec 2026", without going through the viewer's time zone. */
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * The Advisor card's footer in plain words: one line ("≈ $8 over 3 months · matches your safe, stablecoin pick")
 * and the rest as rounded detail rows. Built from the recommendation's data, not from `fitReasons`.
 */
export function fitSummary(rec: Recommendation, intent: Intent, network: Network): { line: string; details: string[] } {
  const { pool, verdict } = rec;
  const horizon = HORIZON[intent.horizon.value];
  const risk = RISK[intent.risk.value];
  const judged = verdict.label !== 'NOT_JUDGED';
  const asset = intent.assetPref.value === 'any' ? null : ASSET[intent.assetPref.value];
  const max = MAX_RISK[intent.risk.value];
  // Covered vaults can sit above the risk limit (the top picks never do): say so rather than claim a match.
  const over = judged && max != null && verdict.risk != null && verdict.risk > max ? verdict.risk.toFixed(1) : null;

  const usd = rec.expectedReturnUsd;
  const gain = usd <= 0 ? `Fits ${horizon}` : `≈ ${usd < 1 ? 'under $1' : `$${Math.round(usd).toLocaleString('en-US')}`} over ${horizon}`;
  const fit = over ? `risk ${over}, above your ${risk} limit of ${max}`
    : judged ? `matches your ${[risk, asset].filter(Boolean).join(', ')} pick` : 'not judged yet, so check it before depositing';
  const line = `${gain} · ${fit}`;

  const details = [
    `Base yield ${pool.realApy.toFixed(1)}% a year, not counting token rewards`,
    ...(over ? [`Risk ${over} of 5 is above your ${risk} limit of ${max}`]
      : judged ? [max == null ? `Your ${risk} pick accepts any risk short of AVOID` : `Within your ${risk} limit of risk ${max} or less`] : []),
    pool.maturity ? `Ends ${day(pool.maturity)}, inside your ${horizon}` : `No end date listed, so it fits ${horizon}`,
    ...(asset ? [] : [`Any asset accepted; this one is a ${ASSET[pool.assetClass]}`]),
  ];
  if (!vaultForPool(network, pool.id)) {
    const closest = rec.mirrorVault && NETWORKS[network].vaults.find((v) => v.address.toLowerCase() === rec.mirrorVault!.toLowerCase());
    details.push(`No Tare vault for this exact pool on ${network}${closest ? `. Closest testnet demo vault: ${closest.name}` : ''}`);
  }
  return { line, details };
}
