import type { Network } from '../../shared/networks';

/** Workers Free allows 100k Durable Object requests a day; 4 testnet vaults at 5 s used ~69k of that on alarms alone. */
export const ALARM_MS: Record<Network, number> = { testnet: 15_000, mainnet: 30_000 };
