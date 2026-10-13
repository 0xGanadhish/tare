import { isNetwork, type Network } from '@/shared/networks';

export const NETWORK_STORAGE_KEY = 'tare.network';
export const NETWORK_PARAM = 'network';

/** Network choice order (spec §8.1): `?network=` URL param, then localStorage, then testnet. */
export function resolveNetwork(urlParam: string | null, stored: string | null): Network {
  if (isNetwork(urlParam)) return urlParam;
  if (isNetwork(stored)) return stored;
  return 'testnet';
}
