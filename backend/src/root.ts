import { json } from './http';

/** Public routes listed at GET /. Admin routes are left out on purpose. */
export const PUBLIC_ROUTES = [
  'GET /v1/health',
  'GET /v1/pools',
  'GET /v1/pools/{poolId}',
  'GET /v1/verdicts?network={testnet|mainnet}',
  'GET /v1/vaults/{network}/{vault}/latest',
  'GET /v1/events/{network}/{owner}?since={iso}',
  'GET /v1/ledger/score?network={testnet|mainnet}',
] as const;

/** GET /: what this API is and where to go next. */
export function apiIndex(): Response {
  return json({
    name: 'Tare API',
    version: 'v1',
    routes: PUBLIC_ROUTES,
    links: {
      app: 'https://tarefi.xyz',
      ledger: 'https://tarefi.xyz/app/ledger',
      state: 'https://ledger.tarefi.xyz/state/{stateHash}.json',
      source: 'https://github.com/0xGanadhish/tare',
    },
  });
}
