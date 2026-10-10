import type { AssetClass } from '../shared/types';

export function assetClass(symbol: string, project: string): AssetClass {
  const s = symbol.toUpperCase();
  const p = project.toLowerCase();
  if (s.includes('XAUT')) return 'gold';
  if (s.startsWith('PT-') || p === 'centrifuge-protocol' || p === 'midas-rwa' || /SYRUP|MROX/.test(s)) return 'rwa';
  if (s === 'MON' || /SHMON|SMON|GMON|WMON/.test(s)) return 'mon';
  if (/BTC|ETH/.test(s)) return 'btc_eth';
  if (/USD|GHO/.test(s)) return 'stable';
  return 'other';
}

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function maturity(symbol: string): string | null {
  const match = /^PT-.+-(\d{1,2})([A-Z]{3})(\d{4})$/i.exec(symbol);
  if (!match) return null;
  const day = Number(match[1]);
  const month = months.indexOf(match[2].toUpperCase());
  const year = Number(match[3]);
  if (month < 0 || year < 1000) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
