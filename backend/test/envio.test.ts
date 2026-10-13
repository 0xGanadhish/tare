import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFlows, readProtections, realEnvioDeps, syncProtections, type EnvioDeps, type GuardianLog } from '../src/envio';
import type { Env } from '../src/env';

import { NETWORKS } from '../../shared/networks';

// Real deploy block once DeployV2 has run; the getLogs fallback starts there.
const D = NETWORKS.testnet.deployBlock;
const VAULT = '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC' as const;
const A = '0x00000000000000000000000000000000000000a1';
const B = '0x00000000000000000000000000000000000000b2';
const NOW = 1_760_000_000;
// Envio's chain_metadata for a deployment built from the current config: it starts at the deploy block.
const META = { start_block: Number(D), latest_processed_block: 500 };

function graphql(handler: (query: string, variables: Record<string, unknown>) => unknown): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    const data = handler(query, variables);
    return data instanceof Response ? data : Response.json({ data });
  }) as typeof fetch;
}

const down: typeof fetch = (async () => new Response('bad gateway', { status: 502 })) as typeof fetch;

function deps(over: Partial<EnvioDeps> = {}): EnvioDeps {
  return { url: 'https://envio.test/v1/graphql', fetch: down, getBlockNumber: async () => 0n, getGuardianLogs: async () => [], ...over };
}

describe('readFlows', () => {
  it('readFlows: GraphQL error → null', async () => {
    expect(await readFlows(deps(), 'testnet', VAULT, NOW, 1_000_000_000n)).toBeNull();
    const errors = graphql(() => new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { headers: { 'content-type': 'application/json' } }));
    expect(await readFlows(deps({ fetch: errors }), 'testnet', VAULT, NOW, 1_000_000_000n)).toBeNull();
  });

  it('readFlows: no Envio URL → null', async () => {
    expect(await readFlows(deps({ url: null }), 'testnet', VAULT, NOW, 1_000_000_000n)).toBeNull();
  });

  it('readFlows: sums in/out and computes pct', async () => {
    let seen: Record<string, unknown> = {};
    const fetchImpl = graphql((_q, variables) => {
      seen = variables;
      return { chain_metadata: [META], VaultFlowHour: [
        { inAssets: '10000000', outAssets: '60000000', largestOut: '40000000' }, // 10 in, 60 out, largest 40 USDC
        { inAssets: '0', outAssets: '100000000', largestOut: '90000000' },
      ] };
    });
    // 150 USDC net out of 1,000 USDC TVL
    expect(await readFlows(deps({ fetch: fetchImpl }), 'testnet', VAULT, NOW, 1_000_000_000n)).toEqual({ netOutUsd: 150, netOutPctTvl: 15, largestOutUsd: 90 });
    expect(seen).toEqual({ chainId: 10143, vault: VAULT.toLowerCase(), since: String(Math.floor((NOW - 3600) / 3600) * 3600) });
  });

  it('readFlows: an Envio deployment built before the contracts existed reads as unavailable, not zero', async () => {
    // Placeholder config: start block 0, so its empty buckets mean "not indexed", not "no outflow".
    const stale = graphql(() => ({ chain_metadata: [{ start_block: 0, latest_processed_block: 500 }], VaultFlowHour: [] }));
    expect(await readFlows(deps({ fetch: stale }), 'testnet', VAULT, NOW, 1_000_000_000n)).toBeNull();
    const missing = graphql(() => ({ chain_metadata: [], VaultFlowHour: [] }));
    expect(await readFlows(deps({ fetch: missing }), 'testnet', VAULT, NOW, 1_000_000_000n)).toBeNull();
  });

  it('readFlows: net inflow reads as zero outflow', async () => {
    const fetchImpl = graphql(() => ({ chain_metadata: [META], VaultFlowHour: [{ inAssets: '500000000', outAssets: '1000000', largestOut: '1000000' }] }));
    expect(await readFlows(deps({ fetch: fetchImpl }), 'testnet', VAULT, NOW, 1_000_000_000n)).toEqual({ netOutUsd: 0, netOutPctTvl: 0, largestOutUsd: 1 });
  });
});

describe('readProtections', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM protections; DELETE FROM log_cursors;'); });

  it('readProtections: Envio first, lowercase vault, enabled only', async () => {
    let seen: Record<string, unknown> = {};
    const fetchImpl = graphql((_q, variables) => {
      seen = variables;
      return {
        Protection: [{ owner: A, vault: VAULT.toLowerCase(), minConfidenceBps: 9000 }, { owner: B, vault: '0x0000000000000000000000000000000000000009', minConfidenceBps: 8000 }],
        chain_metadata: [META],
      };
    });
    expect(await readProtections(env.DB, deps({ fetch: fetchImpl }), 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9000 }]);
    expect(seen).toEqual({ chainId: 10143 });
    // The Envio snapshot also refreshes the local copy, so a later fallback only replays from block 500.
    expect(await env.DB.prepare(`SELECT block FROM log_cursors WHERE network = 'testnet' AND name = 'guardian'`).first('block')).toBe(500);
  });

  it('readProtections: Envio down → getLogs fallback returns the enabled owners', async () => {
    const logs: GuardianLog[] = [
      { kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9000, blockNumber: D + 10n, logIndex: 0 },
      { kind: 'enabled', owner: B, vault: VAULT, minConfidenceBps: 8500, blockNumber: D + 11n, logIndex: 0 },
      { kind: 'disabled', owner: B, vault: VAULT, minConfidenceBps: 0, blockNumber: D + 12n, logIndex: 1 },
      { kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9500, blockNumber: D + 150n, logIndex: 0 }, // rule updated
    ];
    const ranges: [bigint, bigint][] = [];
    const fallback = deps({
      getBlockNumber: async () => D + 250n,
      getGuardianLogs: async (_n, from, to) => { ranges.push([from, to]); return logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to); },
    });
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9500 }]);
    expect(ranges).toEqual([[D, D + 99n], [D + 100n, D + 199n], [D + 200n, D + 250n]]); // 100-block chunks from the deploy block
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9500 }]);
    expect(ranges).toHaveLength(3); // already caught up: nothing re-read
  });

  it('readProtections: a failed chunk keeps what was read and resumes there', async () => {
    let fail = true;
    const fallback = deps({
      getBlockNumber: async () => D + 250n,
      getGuardianLogs: async (_n, from) => {
        if (from === D + 100n && fail) { fail = false; throw new Error('rpc'); }
        return from === D ? [{ kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9000, blockNumber: D + 5n, logIndex: 0 }] : [];
      },
    });
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9000 }]);
    expect(await env.DB.prepare(`SELECT block FROM log_cursors WHERE name = 'guardian'`).first('block')).toBe(Number(D + 99n));
  });

  it('readProtections: a stale Envio deployment is ignored; the logs decide', async () => {
    const stale = graphql(() => ({ Protection: [], chain_metadata: [{ start_block: 0, latest_processed_block: Number(D) + 5000 }] }));
    const fallback = deps({
      fetch: stale,
      getBlockNumber: async () => D + 50n,
      getGuardianLogs: async (_n, from) => (from === D ? [{ kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 8000, blockNumber: D + 7n, logIndex: 0 }] : []),
    });
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 8000 }]);
    // The stale answer neither wiped the local copy nor moved the cursor to Envio's block.
    expect(await env.DB.prepare(`SELECT block FROM log_cursors WHERE name = 'guardian'`).first('block')).toBe(Number(D + 50n));
  });
});

describe('syncProtections', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM protections; DELETE FROM log_cursors;'); });

  it('syncProtections: catches up at most maxChunks per call, and skips while within minLag of the head', async () => {
    const ranges: [bigint, bigint][] = [];
    let head = D + 1_000n;
    const sync = deps({
      getBlockNumber: async () => head,
      getGuardianLogs: async (_n, from, to) => {
        ranges.push([from, to]);
        return from === D + 300n ? [{ kind: 'enabled', owner: B, vault: VAULT, minConfidenceBps: 8000, blockNumber: D + 321n, logIndex: 0 }] : [];
      },
    });
    await syncProtections(env.DB, sync, 'testnet', { maxChunks: 4n, minLag: 200n });
    expect(ranges).toEqual([[D, D + 99n], [D + 100n, D + 199n], [D + 200n, D + 299n], [D + 300n, D + 399n]]);
    await syncProtections(env.DB, sync, 'testnet', { maxChunks: 4n, minLag: 200n });
    await syncProtections(env.DB, sync, 'testnet', { maxChunks: 4n, minLag: 200n });
    expect(ranges.at(-1)).toEqual([D + 1_000n, D + 1_000n]); // chunks start at the deploy block
    const calls = ranges.length;
    head = D + 1_150n; // 150 new blocks: under minLag, so no RPC calls
    await syncProtections(env.DB, sync, 'testnet', { maxChunks: 4n, minLag: 200n });
    expect(ranges).toHaveLength(calls);
    // What it read is what readProtections serves when Envio is down.
    expect(await readProtections(env.DB, deps({ getBlockNumber: async () => D + 1_000n }), 'testnet', VAULT)).toEqual([{ owner: B, minConfidenceBps: 8000 }]);
  });

  it('syncProtections: an RPC failure is logged, never thrown', async () => {
    await expect(syncProtections(env.DB, deps({ getBlockNumber: async () => { throw new Error('rpc down'); } }), 'testnet', { maxChunks: 4n, minLag: 200n })).resolves.toBeUndefined();
  });
});

describe('realEnvioDeps', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('realEnvioDeps: Guardian log reads go to the public RPC, even when Alchemy is set (Alchemy rejects them)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input instanceof Request ? input.url : input));
      const { id, method } = JSON.parse(String(init?.body));
      return Response.json({ jsonrpc: '2.0', id, result: method === 'eth_blockNumber' ? '0x10' : [] });
    });
    const real = realEnvioDeps({ ALCHEMY_URL_MAINNET: 'https://alchemy.test/v2/key' } as unknown as Env);
    expect(await real.getBlockNumber('mainnet')).toBe(16n);
    expect(await real.getGuardianLogs('mainnet', 1n, 2n)).toEqual([]);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls.every((u) => u.startsWith('https://rpc.monad.xyz'))).toBe(true);
  });
});
