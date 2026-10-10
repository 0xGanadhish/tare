// Captures DeFiLlama Monad pools into fixtures/. Temporary inline rules (spec §6.2/§6.3);
// B1 replaces normalize() with lib/indexer at CP1.
import { writeFileSync, mkdirSync } from 'node:fs';
import type { AssetClass, Pool, Verdict } from '../shared/types';

const MIN_TVL = 100_000;

function classify(symbol: string, project: string): AssetClass {
  const s = symbol.toUpperCase();
  if (s.includes('XAUT')) return 'gold';
  if (s.startsWith('PT-') || ['centrifuge-protocol', 'midas-rwa'].includes(project) || s.includes('SYRUP') || s.includes('MROX')) return 'rwa';
  if (['SHMON', 'SMON', 'GMON', 'WMON'].some((t) => s.includes(t)) || s === 'MON') return 'mon';
  if (s.includes('BTC') || s.includes('ETH')) return 'btc_eth';
  if (['USD', 'AUSD', 'USDC', 'USDT', 'GHO', 'USDE'].some((t) => s.includes(t))) return 'stable';
  return 'other';
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
function maturity(symbol: string): string | null {
  const m = /^PT-.+-(\d{1,2})([A-Z]{3})(\d{4})$/i.exec(symbol);
  if (!m) return null;
  const mm = MONTHS[m[2].toUpperCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalize(r: any): Pool {
  const apy = num(r.apy) ?? 0;
  const apyBase = num(r.apyBase) ?? 0;
  const apyReward = num(r.apyReward) ?? 0;
  return {
    id: r.pool, project: r.project, symbol: r.symbol, assetClass: classify(r.symbol, r.project),
    tvlUsd: num(r.tvlUsd) ?? 0, apy, apyBase, apyReward,
    apyMean30d: num(r.apyMean30d), sigma: num(r.sigma),
    realApy: apyBase, incentiveShare: apy > 0 ? apyReward / apy : 0,
    apyPct7D: num(r.apyPct7D),
    ilRisk: r.ilRisk === 'yes', exposure: r.exposure === 'multi' ? 'multi' : 'single',
    maturity: maturity(r.symbol), underlying: Array.isArray(r.underlyingTokens) ? r.underlyingTokens : [], meta: r.poolMeta ?? null,
  };
}

function placeholderVerdict(p: Pool, now: string): Verdict {
  const label = p.apy > 5 && p.incentiveShare > 0.5 ? 'AVOID' : p.tvlUsd > 5e6 && p.incentiveShare < 0.3 && p.apy > 0 ? 'DEPOSIT' : 'CONSIDER';
  return {
    poolId: p.id, label, confidence: 0.5, risk: null, yieldSource: null, band: 'low',
    flags: [], statsHash: `${p.apy.toFixed(2)}:${p.tvlUsd.toFixed(0)}`, judgedAt: now, source: 'heuristic-placeholder',
  };
}

async function main() {
  const res = await fetch('https://yields.llama.fi/pools');
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const { data } = (await res.json()) as { data: any[] };
  const pools = data.filter((r) => r.chain === 'Monad' && (r.tvlUsd ?? 0) >= MIN_TVL).map(normalize).sort((a, b) => b.tvlUsd - a.tvlUsd);
  const asOf = new Date().toISOString();
  mkdirSync('fixtures', { recursive: true });
  writeFileSync('fixtures/pools.json', JSON.stringify({ pools, asOf }, null, 1));
  if (process.argv.includes('--verdicts')) {
    const verdicts = Object.fromEntries(pools.map((p) => [p.id, placeholderVerdict(p, asOf)]));
    writeFileSync('fixtures/verdicts.json', JSON.stringify(verdicts, null, 1));
  }
  const tvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
  console.log(`pools=${pools.length} protocols=${new Set(pools.map((p) => p.project)).size} tvl=$${(tvl / 1e9).toFixed(2)}B`);
}

main();
