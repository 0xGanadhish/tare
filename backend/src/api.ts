import { isNetwork, type Network } from '../../shared/networks';
import type { Env } from './env';
import { error, json, preflight } from './http';
import { scoreLedger } from './score';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_LIMIT = 100;
const VERDICT_NAMES = ['HOLD', 'EXIT', 'MOVE'] as const;

interface PostRow {
  network: Network; id: number; vault: string; verdict: number; confidence_bps: number; risk_bps: number;
  state_hash: string; posted_at: number; tx_hash: string | null; resolved: number; adverse: number | null;
  reasons: number | null; drill: number;
}

export function toVerdict(r: PostRow) {
  return {
    network: r.network, id: r.id, vault: r.vault, verdict: r.verdict, confidenceBps: r.confidence_bps, riskBps: r.risk_bps,
    stateHash: r.state_hash, postedAt: r.posted_at, txHash: r.tx_hash, resolved: r.resolved === 1,
    adverse: r.adverse === null ? null : r.adverse === 1, reasons: r.reasons, drill: r.drill === 1,
  };
}

const parse = (text: string | null) => (text === null ? null : JSON.parse(text));

async function pools(env: Env): Promise<Response> {
  const [pools, verdicts] = await env.DB.batch<{ json: string; updated_at?: string; pool_id?: string }>([
    env.DB.prepare(`SELECT json, updated_at FROM pools WHERE network = 'mainnet' ORDER BY id`),
    env.DB.prepare(`SELECT pool_id, json FROM pool_verdicts WHERE network = 'mainnet'`),
  ]);
  const asOf = pools.results.reduce<string | null>((max, r) => (max === null || r.updated_at! > max ? r.updated_at! : max), null);
  return json({
    pools: pools.results.map((r) => JSON.parse(r.json)),
    verdicts: Object.fromEntries(verdicts.results.map((r) => [r.pool_id, JSON.parse(r.json)])),
    asOf,
  });
}

async function pool(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT p.json AS pool, v.json AS verdict FROM pools p
    LEFT JOIN pool_verdicts v ON v.network = p.network AND v.pool_id = p.id WHERE p.network = 'mainnet' AND p.id = ?`)
    .bind(id).first<{ pool: string; verdict: string | null }>();
  return row ? json({ pool: JSON.parse(row.pool), verdict: parse(row.verdict) }) : error(404, 'not_found');
}

async function verdicts(env: Env, q: URLSearchParams, network: Network): Promise<Response> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(q.get('limit') ?? '', 10) || 50));
  const cursor = q.get('cursor');
  const vault = q.get('vault');
  if (cursor !== null && !/^\d+$/.test(cursor)) return error(400, 'bad_cursor');
  if (vault !== null && !ADDRESS.test(vault)) return error(400, 'bad_vault');
  const where = ['network = ?'];
  const args: unknown[] = [network];
  if (vault) { where.push('vault = ?'); args.push(vault.toLowerCase()); }
  if (cursor) { where.push('id < ?'); args.push(Number(cursor)); }
  const { results } = await env.DB.prepare(`SELECT * FROM posts WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`)
    .bind(...args, limit + 1).all<PostRow>();
  const page = results.slice(0, limit);
  return json({ verdicts: page.map(toVerdict), cursor: results.length > limit ? String(page[page.length - 1].id) : null });
}

async function latest(env: Env, network: Network, vault: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM posts WHERE network = ? AND vault = ? ORDER BY id DESC LIMIT 1')
    .bind(network, vault.toLowerCase()).first<PostRow>();
  return row ? json({ verdict: toVerdict(row) }) : error(404, 'not_found');
}

async function events(env: Env, network: Network, owner: string, since: string | null): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT id, network, owner, vault, type, message, tx_hash AS txHash, confidence, at
    FROM events WHERE network = ? AND owner = ? AND at > ? ORDER BY at, id LIMIT 200`)
    .bind(network, owner.toLowerCase(), since ?? '').all();
  return json({ events: results });
}

async function score(env: Env, network: Network): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT verdict, confidence_bps, risk_bps, resolved, adverse FROM posts WHERE network = ? AND drill = 0')
    .bind(network).all<Pick<PostRow, 'verdict' | 'confidence_bps' | 'risk_bps' | 'resolved' | 'adverse'>>();
  return json(scoreLedger(results.map((r) => ({
    verdict: VERDICT_NAMES[r.verdict], confidenceBps: r.confidence_bps, riskBps: r.risk_bps, resolved: r.resolved === 1, adverse: r.adverse === null ? null : r.adverse === 1,
  }))));
}

/** Read-only public API (plan Task 8). Returns null for routes it does not own. */
export async function handleRead(request: Request, env: Env): Promise<Response | null> {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const q = url.searchParams;
  const net = (value: string | null | undefined) => (isNetwork(value) ? value : null);

  if (parts[0] !== 'v1') return null;
  if (parts[1] === 'pools' && parts.length === 2) return pools(env);
  if (parts[1] === 'pools' && parts.length === 3) return pool(env, decodeURIComponent(parts[2]));
  if (parts[1] === 'verdicts' && parts.length === 2) {
    const network = net(q.get('network'));
    return network ? verdicts(env, q, network) : error(400, 'bad_network');
  }
  if (parts[1] === 'vaults' && parts.length === 5 && parts[4] === 'latest') {
    const network = net(parts[2]);
    if (!network) return error(400, 'bad_network');
    return ADDRESS.test(parts[3]) ? latest(env, network, parts[3]) : error(400, 'bad_vault');
  }
  if (parts[1] === 'events' && parts.length === 4) {
    const network = net(parts[2]);
    if (!network) return error(400, 'bad_network');
    return ADDRESS.test(parts[3]) ? events(env, network, parts[3], q.get('since')) : error(400, 'bad_owner');
  }
  if (parts[1] === 'ledger' && parts[2] === 'score' && parts.length === 3) {
    const network = net(q.get('network'));
    return network ? score(env, network) : error(400, 'bad_network');
  }
  return null;
}
