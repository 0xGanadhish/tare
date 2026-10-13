import type { Network } from '@/shared/networks';

/** How long the oracle waits before a verdict can be graded (TareRiskOracle `resolveWindow`). */
export const RESOLVE_WINDOW: Record<Network, string> = { testnet: '1 hour', mainnet: '24 hours' };
/** After that, how long anyone can record readings that grading uses (TareRiskOracle `sampleWindow`; none on testnet). */
export const SAMPLE_WINDOW: Record<Network, string | null> = { testnet: null, mainnet: '1 hour' };
