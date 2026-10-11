import { handleAdmin } from './admin';
import { handleRead } from './api';
import type { Env, ExitJob } from './env';
import { handleExitBatch } from './exits';
import { error } from './http';

export default {
  async fetch(request, env) {
    try {
      return (await handleRead(request, env)) ?? (await handleAdmin(request, env)) ?? error(404, 'not_found');
    } catch (err) {
      console.error(JSON.stringify({ msg: 'request_failed', path: new URL(request.url).pathname, error: String(err) }));
      return error(500, 'internal');
    }
  },
  async queue(batch, env) {
    await handleExitBatch(batch, env);
  },
} satisfies ExportedHandler<Env, ExitJob>;

export { VaultWatcher } from "./watcher";
export { TxSender } from "./txSender";
