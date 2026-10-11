import { encodeFunctionData, isAddress, type Address } from 'viem';
import { abis } from '../../shared/contracts';
import { isNetwork, NETWORK_IDS, NETWORKS, type Network } from '../../shared/networks';
import type { PositionJudgment } from '../../shared/types';
import { stateHash, type StateDocument } from '../../shared/verdict';
import { postVerdict } from './archive';
import type { Env, KeyRole } from './env';
import { error, json } from './http';
import { txSender, type Sender } from './txSender';
import { realEnvioDeps, readProtections } from './envio';
import { fanOut, watcherFor, type WatcherDeps } from './watcher';

export interface AdminDeps extends Pick<WatcherDeps, 'readProtections' | 'enqueue'> { sender(network: Network, role: KeyRole): Sender }
export const realAdminDeps = (env: Env): AdminDeps => ({
  sender: (network, role) => txSender(env, network, role),
  readProtections: (network, vault) => readProtections(env.DB, realEnvioDeps(env), network, vault.address as Address),
  enqueue: async (job) => { await env.EXITS.send(job); },
});

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

const bps = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10_000;
const vaultIn = (network: Network, vault: unknown) =>
  typeof vault === 'string' && isAddress(vault, { strict: false }) ? NETWORKS[network].vaults.find((v) => v.address.toLowerCase() === vault.toLowerCase()) ?? null : null;

/** Demo control: move a testnet mirror's stats. Mainnet has no such thing, so the route doesn't exist there. */
async function setStats(body: Record<string, unknown>, deps: AdminDeps): Promise<Response> {
  if (body.network === 'mainnet') return error(404, 'not_found');
  if (body.network !== 'testnet') return error(400, 'bad_network');
  const vault = vaultIn('testnet', body.vault);
  if (!vault || vault.protocol !== 'mirror') return error(400, 'bad_vault');
  if (!bps(body.apyBps) || !bps(body.utilBps)) return error(400, 'bad_bps');
  const receipt = await deps.sender('testnet', 'attester').send({
    to: vault.address, kind: 'admin',
    data: encodeFunctionData({ abi: abis.mirrorVault, functionName: 'setStats', args: [body.apyBps, body.utilBps] }),
  });
  return json({ txHash: receipt.hash, status: receipt.status });
}

/** Labelled manual drill for the mainnet proof (spec §9): EXIT at 95%, marked as a drill in R2 and D1. */
async function drill(env: Env, body: Record<string, unknown>, deps: AdminDeps): Promise<Response> {
  if (!isNetwork(body.network)) return error(400, 'bad_network');
  const network = body.network;
  const vault = vaultIn(network, body.vault);
  if (!vault) return error(400, 'bad_vault');
  const at = new Date().toISOString();
  const judgment: PositionJudgment = { action: { value: 'exit', confidence: 0.95 }, withdrawalRisk: 0.5, yieldCollapse: 0, statsHash: 'drill', at };
  const doc: StateDocument = {
    v: 1, network, vault: vault.address, drill: true, at, model: 'manual-drill', questions: null, answers: null,
    state: `Manual drill posted by the Tare operator to demonstrate a Guardian exit on ${vault.name}. This is not a Jev verdict.`,
  };
  const { id, txHash } = await postVerdict(env, network, vault.address, judgment, doc, deps.sender(network, 'attester'));
  await fanOut(env.DB, deps, network, vault, id, judgment, txHash);
  return json({ id: id.toString(), txHash, stateHash: stateHash(doc) });
}

/** Admin routes (ADMIN_TOKEN). Returns null for routes it does not own. */
export async function handleAdmin(request: Request, env: Env, deps: AdminDeps = realAdminDeps(env)): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST' || !pathname.startsWith('/v1/admin/')) return null;
  if (!(await authorized(request, env))) return error(401, 'unauthorized');
  if (pathname === '/v1/admin/watchers/start') return startWatchers(env);
  const body = await request.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return error(400, 'bad_json');
  if (pathname === '/v1/admin/stats') return setStats(body, deps);
  if (pathname === '/v1/admin/drill') return drill(env, body, deps);
  return null;
}
