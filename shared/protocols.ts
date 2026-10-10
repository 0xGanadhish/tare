/** Official app URLs for the protocols in the pool set, from DeFiLlama's protocol list (api.llama.fi/protocols, 2026-10-10). */
export const PROTOCOL_URLS: Record<string, string> = {
  'aave-v3': 'https://aave.com',
  accountable: 'https://accountable.capital/',
  'balancer-v3': 'https://balancer.fi/',
  beefy: 'https://beefy.com',
  'centrifuge-protocol': 'https://centrifuge.io',
  curvance: 'https://app.curvance.com',
  'curve-dex': 'https://curve.finance',
  'euler-v2': 'https://www.euler.finance',
  kintsu: 'https://kintsu.xyz/',
  'magma-staking': 'https://www.magmastaking.xyz/',
  'mento-v3': 'https://app.mento.org',
  'midas-rwa': 'https://midas.app',
  'morpho-blue': 'https://app.morpho.org',
  neverland: 'https://neverland.money',
  'pendle-v2': 'https://pendle.finance/',
  shmonad: 'https://shmonad.xyz/',
  'townsquare-lending': 'https://app.townsq.xyz/',
  'uniswap-v3': 'https://app.uniswap.org/',
  upshift: 'https://app.upshift.finance',
  'yuzu-money': 'https://app.yuzu.money',
};

/** The protocol's app, when known. */
export function protocolUrl(project: string): string | null {
  return PROTOCOL_URLS[project] ?? null;
}

/** DeFiLlama's page for this exact pool (live APY/TVL history, links to the protocol). */
export function poolDetailsUrl(poolId: string): string {
  return `https://defillama.com/yields/pool/${encodeURIComponent(poolId)}`;
}
