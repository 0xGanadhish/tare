import { createPublicClient, http, parseAbiItem, type Address } from 'viem';
import type { Flows } from '../../lib/judge/state';
import { NETWORKS, type Network } from '../../shared/networks';
import { rpcFor, type Env } from './env';
import { safeError } from './errors';
import type { Protection } from './watcher';

/** The public RPC caps getLogs at 100 blocks per call (as in worker/index.ts). */
const CHUNK = 100n;
/** Bounds one fallback call's subrequests; a long gap catches up over several calls. */
const MAX_CHUNKS_PER_CALL = 50n;
const USDC_DECIMALS = 6;
const HOUR = 3600;

export interface GuardianLog { kind: 'enabled' | 'disabled'; owner: string; vault: string; minConfidenceBps: number; blockNumber: bigint; logIndex: number }

export interface EnvioDeps {
  url: string | null;
  fetch: typeof fetch;
  getBlockNumber(network: Network): Promise<bigint>;
  getGuardianLogs(network: Network, fromBlock: bigint, toBlock: bigint): Promise<GuardianLog[]>;
}

const enabledEvent = parseAbiItem('event Enabled(address indexed owner, address indexed vault, uint16 minConfidenceBps, uint32 maxAge)');
const disabledEvent = parseAbiItem('event Disabled(address indexed owner, address indexed vault)');

export function realEnvioDeps(env: Env): EnvioDeps {
  const client = (network: Network) => createPublicClient({ chain: NETWORKS[network].chain, transport: http(rpcFor(env, network), { retryCount: 2 }) });
  return {
    url: env.ENVIO_GRAPHQL_URL ?? null,
    fetch: (input, init) => fetch(input, init),
    getBlockNumber: (network) => client(network).getBlockNumber(),
    async getGuardianLogs(network, fromBlock, toBlock) {
      const logs = await client(network).getLogs({ address: NETWORKS[network].guardian, events: [enabledEvent, disabledEvent], fromBlock, toBlock });
      return logs.map((l) => ({
        kind: l.eventName === 'Enabled' ? 'enabled' : 'disabled', owner: l.args.owner!, vault: l.args.vault!,
        minConfidenceBps: l.eventName === 'Enabled' ? l.args.minConfidenceBps! : 0, blockNumber: l.blockNumber, logIndex: l.logIndex,
      }));
    },
  };
}

async function query<T>(deps: EnvioDeps, gql: string, variables: Record<string, unknown>): Promise<T> {
  if (!deps.url) throw new Error('ENVIO_GRAPHQL_URL is not set');
  const res = await deps.fetch(deps.url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: gql, variables }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Envio HTTP ${res.status}`);
  const body = await res.json<{ data?: T; errors?: { message: string }[] }>();
  if (body.errors?.length || !body.data) throw new Error(`Envio: ${body.errors?.[0]?.message ?? 'no data'}`);
  return body.data;
}

const usd = (assets: bigint) => Number(assets) / 10 ** USDC_DECIMALS;

interface ChainMeta { start_block: number; latest_processed_block: number }
const META_FIELDS = 'chain_metadata(where: { chain_id: { _eq: $chainId } }) { start_block latest_processed_block }';

/**
 * Envio's row for this chain, if its deployment indexes the current contracts. A deployment built before they existed
 * (placeholder addresses, start block 0) answers with empty lists, which must read as "unavailable", not "none".
 */
function current(meta: ChainMeta[], network: Network): ChainMeta {
  const row = meta[0];
  if (!row) throw new Error('Envio has no data for this chain');
  if (BigInt(row.start_block) !== NETWORKS[network].deployBlock) throw new Error(`Envio indexes a stale config (start block ${row.start_block})`);
  return row;
}

/**
 * Net outflow over the last hour from Envio's hourly buckets (the current hour and the one before it,
 * so the window is never empty right after the hour turns). Null on any error: Jev is told flows are unavailable.
 */
export async function readFlows(deps: EnvioDeps, network: Network, vault: Address, now: number, totalAssets: bigint): Promise<Flows | null> {
  try {
    const since = Math.floor((now - HOUR) / HOUR) * HOUR;
    const data = await query<{ VaultFlowHour: { inAssets: string; outAssets: string; largestOut: string }[]; chain_metadata: ChainMeta[] }>(deps,
      `query Flows($chainId: Int!, $vault: String!, $since: numeric!) {
        VaultFlowHour(where: { chainId: { _eq: $chainId }, vault: { _eq: $vault }, hourTs: { _gte: $since } }) { inAssets outAssets largestOut }
        ${META_FIELDS}
      }`,
      { chainId: NETWORKS[network].chain.id, vault: vault.toLowerCase(), since: String(since) });
    current(data.chain_metadata, network);
    let net = 0n;
    let largest = 0n;
    for (const h of data.VaultFlowHour) {
      net += BigInt(h.outAssets) - BigInt(h.inAssets);
      if (BigInt(h.largestOut) > largest) largest = BigInt(h.largestOut);
    }
    if (net < 0n) net = 0n;
    const pct = totalAssets === 0n ? 0 : Number((net * 10_000n) / totalAssets) / 100;
    return { netOutUsd: usd(net), netOutPctTvl: pct, largestOutUsd: usd(largest) };
  } catch (err) {
    console.error(JSON.stringify({ msg: 'envio_flows_failed', network, vault, error: safeError(err) }));
    return null;
  }
}

const enabledFor = async (db: D1Database, network: Network, vault: Address): Promise<Protection[]> =>
  (await db.prepare('SELECT owner, min_confidence_bps FROM protections WHERE network = ? AND vault = ? AND enabled = 1 ORDER BY owner')
    .bind(network, vault.toLowerCase()).all<{ owner: Address; min_confidence_bps: number }>()).results
    .map((r) => ({ owner: r.owner, minConfidenceBps: r.min_confidence_bps }));

const upsert = (db: D1Database, network: Network, owner: string, vault: string, enabled: boolean, minConfidenceBps: number) =>
  db.prepare(`INSERT INTO protections (network, owner, vault, enabled, min_confidence_bps) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (network, owner, vault) DO UPDATE SET enabled = ?4, min_confidence_bps = CASE WHEN ?4 = 1 THEN ?5 ELSE min_confidence_bps END`)
    .bind(network, owner.toLowerCase(), vault.toLowerCase(), enabled ? 1 : 0, minConfidenceBps);

const setCursor = (db: D1Database, network: Network, block: bigint) =>
  db.prepare(`INSERT INTO log_cursors (network, name, block) VALUES (?, 'guardian', ?) ON CONFLICT (network, name) DO UPDATE SET block = excluded.block`)
    .bind(network, Number(block));

/**
 * Owners with GuardianV2 enabled on a vault. Envio first; each Envio answer also refreshes a local copy in D1.
 * If Envio is down, the local copy is brought up to date from GuardianV2's Enabled/Disabled logs and used instead.
 */
export async function readProtections(db: D1Database, deps: EnvioDeps, network: Network, vault: Address): Promise<Protection[]> {
  const chainId = NETWORKS[network].chain.id;
  try {
    const data = await query<{ Protection: { owner: string; vault: string; minConfidenceBps: number }[]; chain_metadata: ChainMeta[] }>(deps,
      `query Protections($chainId: Int!) {
        Protection(where: { chainId: { _eq: $chainId }, enabled: { _eq: true } }) { owner vault minConfidenceBps }
        ${META_FIELDS}
      }`, { chainId });
    const block = current(data.chain_metadata, network).latest_processed_block;
    await db.batch([
      db.prepare('DELETE FROM protections WHERE network = ?').bind(network),
      ...data.Protection.map((p) => upsert(db, network, p.owner, p.vault, true, p.minConfidenceBps)),
      setCursor(db, network, BigInt(block)),
    ]);
    return data.Protection.filter((p) => p.vault.toLowerCase() === vault.toLowerCase()).map((p) => ({ owner: p.owner as Address, minConfidenceBps: p.minConfidenceBps }));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'envio_protections_failed', network, vault, error: safeError(err) }));
  }

  await catchUp(db, deps, network, { maxChunks: MAX_CHUNKS_PER_CALL, minLag: 0n }, vault);
  return enabledFor(db, network, vault);
}

/**
 * Keeps the local copy current from GuardianV2's logs between verdicts, a few chunks at a time, so that when Envio is
 * down or stale the read at EXIT time has little left to replay. A no-op while the copy is within `minLag` of the head.
 */
export async function syncProtections(db: D1Database, deps: EnvioDeps, network: Network, budget: { maxChunks: bigint; minLag: bigint }): Promise<void> {
  await catchUp(db, deps, network, budget, null);
}

async function catchUp(db: D1Database, deps: EnvioDeps, network: Network, { maxChunks, minLag }: { maxChunks: bigint; minLag: bigint }, vault: Address | null): Promise<void> {
  const cursor = await db.prepare(`SELECT block FROM log_cursors WHERE network = ? AND name = 'guardian'`).bind(network).first<number>('block');
  let last = cursor === null ? NETWORKS[network].deployBlock - 1n : BigInt(cursor);
  try {
    const head = await deps.getBlockNumber(network);
    if (head - last < minLag) return;
    const end = head < last + CHUNK * maxChunks ? head : last + CHUNK * maxChunks;
    for (let from = last + 1n; from <= end; from += CHUNK) {
      const to = from + CHUNK - 1n < end ? from + CHUNK - 1n : end;
      const logs = (await deps.getGuardianLogs(network, from, to))
        .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
      await db.batch([...logs.map((l) => upsert(db, network, l.owner, l.vault, l.kind === 'enabled', l.minConfidenceBps)), setCursor(db, network, to)]);
      last = to;
    }
  } catch (err) {
    console.error(JSON.stringify({ msg: 'guardian_logs_failed', network, vault, lastBlock: last.toString(), error: safeError(err) }));
  }
}
