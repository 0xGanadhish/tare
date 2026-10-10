import { expect, it } from 'vitest';
import { createPublicClient, erc20Abi, http } from 'viem';
import { monadMainnet } from './chains';
import { MAINNET_TOKENS } from './tokens';

it.skipIf(!process.env.ONLINE)('token table matches on-chain symbol and decimals', async () => {
  const client = createPublicClient({ chain: monadMainnet, transport: http() });
  for (const t of MAINNET_TOKENS) {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: t.address, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: t.address, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    expect({ symbol, decimals }).toEqual({ symbol: t.symbol, decimals: t.decimals });
  }
}, 30_000);
