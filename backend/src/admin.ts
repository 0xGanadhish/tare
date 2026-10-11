import type { Address } from 'viem';
import { NETWORK_IDS, NETWORKS } from '../../shared/networks';
import type { Env } from './env';
import { error, json } from './http';
import { watcherFor } from './watcher';

/** Constant-time bearer check. With no ADMIN_TOKEN configured, every admin call is refused. */
export async function authorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.ADMIN_TOKEN;
  const header = request.headers.get('authorization') ?? '';
  if (!expected || !header.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([header.slice(7), expected].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function startWatchers(env: Env): Promise<Response> {
  const started: { network: string; vault: Address }[] = [];
  for (const network of NETWORK_IDS) {
    for (const v of NETWORKS[network].vaults) {
      await watcherFor(env, network, v.address).start(network, v.address);
      started.push({ network, vault: v.address });
    }
  }
  return json({ started });
}

/** Admin routes (ADMIN_TOKEN). Returns null for routes it does not own. */
export async function handleAdmin(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST' || !pathname.startsWith('/v1/admin/')) return null;
  if (!(await authorized(request, env))) return error(401, 'unauthorized');
  if (pathname === '/v1/admin/watchers/start') return startWatchers(env);
  return null;
}
