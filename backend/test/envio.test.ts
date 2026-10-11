import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFlows, readProtections, type EnvioDeps, type GuardianLog } from '../src/envio';

const VAULT = '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC' as const;
const A = '0x00000000000000000000000000000000000000a1';
const B = '0x00000000000000000000000000000000000000b2';
const NOW = 1_760_000_000;

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
      return { VaultFlowHour: [
        { inAssets: '10000000', outAssets: '60000000', largestOut: '40000000' }, // 10 in, 60 out, largest 40 USDC
        { inAssets: '0', outAssets: '100000000', largestOut: '90000000' },
      ] };
    });
    // 150 USDC net out of 1,000 USDC TVL
    expect(await readFlows(deps({ fetch: fetchImpl }), 'testnet', VAULT, NOW, 1_000_000_000n)).toEqual({ netOutUsd: 150, netOutPctTvl: 15, largestOutUsd: 90 });
    expect(seen).toEqual({ chainId: 10143, vault: VAULT.toLowerCase(), since: String(Math.floor((NOW - 3600) / 3600) * 3600) });
  });

  it('readFlows: net inflow reads as zero outflow', async () => {
    const fetchImpl = graphql(() => ({ VaultFlowHour: [{ inAssets: '500000000', outAssets: '1000000', largestOut: '1000000' }] }));
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
        chain_metadata: [{ latest_processed_block: 500 }],
      };
    });
    expect(await readProtections(env.DB, deps({ fetch: fetchImpl }), 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9000 }]);
    expect(seen).toEqual({ chainId: 10143 });
    // The Envio snapshot also refreshes the local copy, so a later fallback only replays from block 500.
    expect(await env.DB.prepare(`SELECT block FROM log_cursors WHERE network = 'testnet' AND name = 'guardian'`).first('block')).toBe(500);
  });

  it('readProtections: Envio down → getLogs fallback returns the enabled owners', async () => {
    const logs: GuardianLog[] = [
      { kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9000, blockNumber: 10n, logIndex: 0 },
      { kind: 'enabled', owner: B, vault: VAULT, minConfidenceBps: 8500, blockNumber: 11n, logIndex: 0 },
      { kind: 'disabled', owner: B, vault: VAULT, minConfidenceBps: 0, blockNumber: 12n, logIndex: 1 },
      { kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9500, blockNumber: 150n, logIndex: 0 }, // rule updated
    ];
    const ranges: [bigint, bigint][] = [];
    const fallback = deps({
      getBlockNumber: async () => 250n,
      getGuardianLogs: async (_n, from, to) => { ranges.push([from, to]); return logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to); },
    });
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9500 }]);
    expect(ranges).toEqual([[0n, 99n], [100n, 199n], [200n, 250n]]); // 100-block chunks from the deploy block
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9500 }]);
    expect(ranges).toHaveLength(3); // already caught up: nothing re-read
  });

  it('readProtections: a failed chunk keeps what was read and resumes there', async () => {
    let fail = true;
    const fallback = deps({
      getBlockNumber: async () => 250n,
      getGuardianLogs: async (_n, from) => {
        if (from === 100n && fail) { fail = false; throw new Error('rpc'); }
        return from === 0n ? [{ kind: 'enabled', owner: A, vault: VAULT, minConfidenceBps: 9000, blockNumber: 5n, logIndex: 0 }] : [];
      },
    });
    expect(await readProtections(env.DB, fallback, 'testnet', VAULT)).toEqual([{ owner: A, minConfidenceBps: 9000 }]);
    expect(await env.DB.prepare(`SELECT block FROM log_cursors WHERE name = 'guardian'`).first('block')).toBe(99);
  });
});
