import { monadTestnet } from '@/shared/chains';

export const txUrl = (hash: string): string => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (address: string): string => `${monadTestnet.blockExplorers.default.url}/address/${address}`;
export const shortHash = (hash: string, head = 6, tail = 4): string =>
  hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
