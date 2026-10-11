import { createEffect, S } from 'envio';
import { createPublicClient, http, parseAbi } from 'viem';
import { START_BLOCKS } from './startBlocks';

const abi = parseAbi(['function totalAssets() view returns (uint256)']);

/**
 * Reads a vault's totalAssets at the block before the indexer's start block, to seed
 * LargeWithdrawal tracking with the TVL that existed before it. Keyed by (chain, vault) only,
 * so every event of a batch shares one call. Needs ENVIO_RPC_URL_<chainId>. Without it, or if
 * the node lacks that block's state, returns null (uncached, so a later run can retry) and the
 * handler falls back to flows seen since the start block. Never reads at latest: today's TVL
 * plus historical flows would count those flows twice.
 */
export const readTotalAssets = createEffect(
  {
    name: 'readTotalAssets',
    input: { chainId: S.number, vault: S.string },
    output: S.union([S.string, null]),
    cache: true,
    rateLimit: { calls: 5, per: 'second' },
  },
  async ({ input, context }) => {
    try {
      const url = process.env[`ENVIO_RPC_URL_${input.chainId}`];
      if (!url) throw new Error(`ENVIO_RPC_URL_${input.chainId} not set`);
      const client = createPublicClient({ transport: http(url, { timeout: 5_000, retryCount: 1 }) });
      const block = Math.max((START_BLOCKS[input.chainId] ?? 0) - 1, 0);
      const assets = await client.readContract({
        address: input.vault as `0x${string}`,
        abi,
        functionName: 'totalAssets',
        blockNumber: BigInt(block),
      });
      return assets.toString();
    } catch (err) {
      context.log.warn(`readTotalAssets ${input.chainId}/${input.vault}: no baseline (${(err as Error).message.split('\n')[0]})`);
      context.cache = false;
      return null;
    }
  },
);
