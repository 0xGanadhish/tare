import { NETWORKS, type Network } from '@/shared/networks';

/** Explorer links for the network the tx or address lives on (defaults to testnet, where v1 history is). */
export const txUrl = (hash: string, network: Network = 'testnet'): string => `${NETWORKS[network].explorer}/tx/${hash}`;
export const addressUrl = (address: string, network: Network = 'testnet'): string => `${NETWORKS[network].explorer}/address/${address}`;
export const shortHash = (hash: string, head = 6, tail = 4): string =>
  hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
