import { handleAdmin } from './admin';
import { handleRead } from './api';
import { liveNetworks, resolveDue, scanPools } from './crons';
import type { Env, ExitJob } from './env';
import { safeError } from './errors';
import { handleExitBatch } from './exits';
import { handleHealth } from './health';
import { error } from './http';
import { apiIndex } from './root';

// Must match [triggers] crons in wrangler.toml.
export const CRON_SCAN = '*/10 * * * *';
/** Every minute: TVL and liquidity are graded at the moment resolve() runs, so it runs as soon as a window ends. */
export const CRON_RESOLVE = '* * * * *';

export function jobsFor(cron: string): ('scanPools' | 'resolveDue')[] {
  if (cron === CRON_SCAN) return ['scanPools'];
  if (cron === CRON_RESOLVE) return ['resolveDue'];
  return [];
}

/** lib/jev reads its key from process.env; nodejs_compat fills it from bindings, this keeps it explicit. */
function exposeJevKey(env: Env) {
  if (env.TYPESAFE_API_KEY) process.env.TYPESAFE_API_KEY = env.TYPESAFE_API_KEY;
}

export default {
  async fetch(request, env) {
    try {
      const { pathname } = new URL(request.url);
      if (request.method === 'GET' && pathname === '/') return apiIndex();
      if (request.method === 'GET' && (pathname === '/health' || pathname === '/v1/health')) return await handleHealth(env);
      return (await handleRead(request, env)) ?? (await handleAdmin(request, env)) ?? error(404, 'not_found');
    } catch (err) {
      console.error(JSON.stringify({ msg: 'request_failed', path: new URL(request.url).pathname, error: safeError(err) }));
      return error(500, 'internal');
    }
  },
  async scheduled(controller, env) {
    exposeJevKey(env);
    for (const job of jobsFor(controller.cron)) {
      if (job === 'scanPools') await scanPools(env);
      else for (const network of liveNetworks()) await resolveDue(env, network, Math.floor(Date.now() / 1000));
    }
  },
  async queue(batch, env) {
    await handleExitBatch(batch, env);
  },
} satisfies ExportedHandler<Env, ExitJob>;

export { VaultWatcher } from './watcher';
export { TxSender } from './txSender';
