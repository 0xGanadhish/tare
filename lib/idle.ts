import { createPublicClient, erc20Abi, formatUnits, http, isAddress, zeroAddress } from 'viem';
import { monadMainnet, MULTICALL3 } from '../shared/chains';
import { MAINNET_TOKENS, NATIVE_MON, WMON_ADDRESS } from '../shared/tokens';
import { readPools, readVerdicts } from '../shared/cache';
import type { Address, Holding, IdleReport, Intent, MirrorInfo, Pool, Recommendation, Verdict } from '../shared/types';
import { advise } from './advisor';

export class InvalidAddress extends Error {
  constructor() { super('Not a valid Monad address'); this.name = 'InvalidAddress'; }
}

export function computeIdleReport(address: Address, holdings: Holding[], pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): IdleReport {
  let idleUsd = 0;
  let potentialYearlyUsd = 0;
  const idleByClass: Partial<Record<Holding['assetClass'], number>> = {};
  for (const holding of holdings) {
    if (holding.earning) continue;
    idleUsd += holding.usd;
    idleByClass[holding.assetClass] = (idleByClass[holding.assetClass] ?? 0) + holding.usd;
  }
  const suggestions: Recommendation[] = [];
  const depositPools = pools.filter((p) => verdicts[p.id]?.label === 'DEPOSIT');
  for (const [assetClass, usd] of Object.entries(idleByClass)) {
    if (usd <= 0) continue;
    const intent: Intent = { text: 'Idle wallet opportunity', amount: usd, asset: null,
      risk: { value: 'high', confidence: 1 }, horizon: { value: 'long', confidence: 1 },
      assetPref: { value: assetClass as Holding['assetClass'], confidence: 1 } };
    const matches = advise(intent, depositPools, verdicts, mirrors);
    if (matches[0]) {
      potentialYearlyUsd += usd * matches[0].realApy / 100;
      suggestions.push(...matches);
    }
  }
  suggestions.sort((a, b) => b.expectedReturnUsd - a.expectedReturnUsd || b.pool.tvlUsd - a.pool.tvlUsd);
  return { address, holdings, idleUsd, potentialYearlyUsd, suggestions: suggestions.slice(0, 3), asOf: new Date().toISOString() };
}

export async function readHoldings(address: Address): Promise<Holding[]> {
  const client = createPublicClient({ chain: monadMainnet, transport: http(undefined, { retryCount: 0 }) });
  const contracts = MAINNET_TOKENS.map((token) => ({ address: token.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [address] as const }));
  let balances: bigint[] = [];
  let nativeBalance = 0n;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const code = await client.getBytecode({ address: MULTICALL3 });
      const tokenBalances = async (): Promise<bigint[]> => {
        if (!code || code === '0x') return Promise.all(contracts.map((contract) => client.readContract(contract)));
        const results = await client.multicall({ contracts });
        return results.map((result) => {
          if (result.status === 'failure') throw new Error('Token balance read failed', { cause: result.error });
          return result.result;
        });
      };
      [balances, nativeBalance] = await Promise.all([tokenBalances(), client.getBalance({ address })]);
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  const coinIds = MAINNET_TOKENS.map((token) => `monad:${token.address}`);
  let prices: Record<string, { price: number }> = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://coins.llama.fi/prices/current/${coinIds.join(',')}`, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`DeFiLlama prices HTTP ${response.status}`);
      const body = await response.json() as { coins: Record<string, { price: number }> };
      if (!body.coins || typeof body.coins !== 'object') throw new Error('Malformed DeFiLlama prices');
      prices = Object.fromEntries(Object.entries(body.coins).map(([key, value]) => [key.toLowerCase(), value]));
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  const tokens = [...MAINNET_TOKENS, { ...NATIVE_MON, address: zeroAddress }];
  return tokens.flatMap((token, index): Holding[] => {
    const balance = index === MAINNET_TOKENS.length ? nativeBalance : balances[index];
    if (balance === 0n) return [];
    const priceAddress = token.address === zeroAddress ? WMON_ADDRESS : token.address;
    const price = prices[`monad:${priceAddress.toLowerCase()}`]?.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new Error(`Missing price for ${token.symbol}`);
    const amount = Number(formatUnits(balance, token.decimals));
    return [{ symbol: token.symbol, token: token.address, amount, usd: amount * price, assetClass: token.assetClass, earning: token.earning }];
  });
}

export async function scanAddress(address: string): Promise<IdleReport> {
  if (!isAddress(address)) throw new InvalidAddress();
  const [holdings, { pools }, verdicts] = await Promise.all([readHoldings(address), readPools(), readVerdicts()]);
  return computeIdleReport(address, holdings, pools, verdicts, []);
}
