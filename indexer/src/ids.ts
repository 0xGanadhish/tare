// Every entity id starts with the chain id so testnet and mainnet rows never collide.
export const lower = (a: string) => a.toLowerCase();
export const verdictId = (chainId: number, postId: bigint) => `${chainId}-${postId}`;
export const protectionId = (chainId: number, owner: string, vault: string) => `${chainId}-${lower(owner)}-${lower(vault)}`;
export const logId = (chainId: number, txHash: string, logIndex: number) => `${chainId}-${txHash}-${logIndex}`;
export const vaultKey = (chainId: number, vault: string) => `${chainId}-${lower(vault)}`;

export const HOUR = 3600;
export const hourOf = (timestamp: number) => Math.floor(timestamp / HOUR) * HOUR;
