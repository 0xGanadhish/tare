import { createPublicClient, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NETWORKS, type Network } from '../../shared/networks';
import { liveNetworks } from './crons';
import { rpcFor, secretFor, type Env, type KeyRole } from './env';
import { json } from './http';
import { ALARM_MS } from './watcher';

export const MIN_BALANCE_WEI = 5n * 10n ** 16n; // 0.05 MON
const ROLES: KeyRole[] = ['attester', 'executor'];

export interface HealthDeps {
  /** Native balance of a backend key, or null when that key isn't configured. */
  balanceOf(network: Network, role: KeyRole): Promise<bigint | null>;
  networks(): Network[];
}

export function realHealthDeps(env: Env): HealthDeps {
  return {
    async balanceOf(network, role) {
      let address;
      try { address = privateKeyToAccount(secretFor(env, role, network)).address; } catch { return null; }
      const client = createPublicClient({ chain: NETWORKS[network].chain, transport: http(rpcFor(env, network)) });
      return client.getBalance({ address });
    },
    networks: liveNetworks,
  };
}

interface HealthRow { network: Network; vault: string; last_post_at: string | null; last_error: string | null; updated_at: string }

/**
 * GET /health (plan Task 13). Red (503) when a watcher stopped ticking for 3 alarm intervals, or a key that pays gas runs low: posts or exits would stop, and that must never be silent.
 * Staleness is measured on the watcher's last tick: a vault whose stats are steady posts rarely, by design.
 */
export async function handleHealth(env: Env, deps: HealthDeps = realHealthDeps(env)): Promise<Response> {
  const now = Date.now();
  const age = (iso: string | null) => (iso === null ? null : Math.round((now - Date.parse(iso)) / 1000));
  const networks = deps.networks();
  const [{ results }, backlog] = await Promise.all([
    env.DB.prepare('SELECT network, vault, last_post_at, last_error, updated_at FROM vault_health ORDER BY network, vault').all<HealthRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM exits WHERE status IN ('sending', 'failed')`).first<number>('n'),
  ]);
  const vaults = results.map((r) => ({ network: r.network, vault: r.vault, lastPostAgeS: age(r.last_post_at), lastTickAgeS: age(r.updated_at)!, lastError: r.last_error }));
  const stale = vaults.some((v) => v.lastTickAgeS * 1000 > 3 * ALARM_MS[v.network]);

  let lowBalance = false;
  const balances: Record<string, Record<string, string | null>> = {};
  for (const network of networks) {
    balances[network] = {};
    for (const role of ROLES) {
      const wei = await deps.balanceOf(network, role).catch(() => null);
      if (wei !== null && wei < MIN_BALANCE_WEI) lowBalance = true;
      balances[network][role] = wei === null ? null : formatEther(wei);
    }
  }
  const ok = !stale && !lowBalance;
  return json({ ok, vaults, queueBacklog: backlog ?? 0, balances }, ok ? 200 : 503);
}
