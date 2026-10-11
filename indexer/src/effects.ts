import { createEffect, S } from 'envio';
import { createPublicClient, http, parseAbi } from 'viem';

const abi = parseAbi(['function totalAssets() view returns (uint256)']);

/**
 * Reads a vault's totalAssets once, to seed LargeWithdrawal tracking with the TVL that
 * existed before the indexer's start block. Needs ENVIO_RPC_URL_<chainId>; without it, or on
 * any RPC error, returns null and the handler falls back to flows seen since the start block.
 */
export const readTotalAssets = createEffect(
  {
    name: 'readTotalAssets',
    input: { chainId: S.number, vault: S.string, blockNumber: S.number },
    output: S.union([S.string, null]),
    cache: true,
    rateLimit: false,
  },
  async ({ input }) => {
    const url = process.env[`ENVIO_RPC_URL_${input.chainId}`];
    if (!url) return null;
    const client = createPublicClient({ transport: http(url) });
    const read = (blockNumber?: bigint) =>
      client.readContract({ address: input.vault as `0x${string}`, abi, functionName: 'totalAssets', blockNumber });
    try {
      // State just before the first event we see; nodes without that history answer at latest.
      return (await read(BigInt(input.blockNumber - 1)).catch(() => read())).toString();
    } catch {
      return null;
    }
  },
);
