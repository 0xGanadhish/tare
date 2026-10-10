import type { Address, AssetClass } from './types';

export interface TokenInfo { symbol: string; address: Address; decimals: number; assetClass: AssetClass; earning: boolean }

// Monad mainnet tokens for the idle scan. All verified on-chain (symbol + decimals) on 2026-10-10.
export const MAINNET_TOKENS: TokenInfo[] = [
  { symbol: 'USDC', address: '0x754704bc059f8c67012fed69bc8a327a5aafb603', decimals: 6, assetClass: 'stable', earning: false },
  { symbol: 'AUSD', address: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', decimals: 6, assetClass: 'stable', earning: false },
  { symbol: 'USDT0', address: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', decimals: 6, assetClass: 'stable', earning: false },
  { symbol: 'WMON', address: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', decimals: 18, assetClass: 'mon', earning: false },
  { symbol: 'XAUt0', address: '0x01bff41798a0bcf287b996046ca68b395dbc1071', decimals: 6, assetClass: 'gold', earning: false },
  { symbol: 'shMON', address: '0x1b68626dca36c7fe922fd2d55e4f631d962de19c', decimals: 18, assetClass: 'mon', earning: true },
  { symbol: 'sMON', address: '0xa3227c5969757783154c60bf0bc1944180ed81b9', decimals: 18, assetClass: 'mon', earning: true },
  { symbol: 'gMON', address: '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081', decimals: 18, assetClass: 'mon', earning: true },
  { symbol: 'WBTC', address: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', decimals: 8, assetClass: 'btc_eth', earning: false },
  { symbol: 'WETH', address: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', decimals: 18, assetClass: 'btc_eth', earning: false },
];

export const NATIVE_MON = { symbol: 'MON', decimals: 18, assetClass: 'mon' as AssetClass, earning: false };

// Price lookups use WMON for native MON.
export const WMON_ADDRESS: Address = '0x3bd359c1119da7da1d913d1c4d2b7c461115433a';
