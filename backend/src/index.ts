import { handleRead } from './api';
import type { Env } from './env';
import { error } from './http';

export default {
  async fetch(request, env) {
    try {
      return (await handleRead(request, env)) ?? error(404, 'not_found');
    } catch (err) {
      console.error(JSON.stringify({ msg: 'request_failed', path: new URL(request.url).pathname, error: String(err) }));
      return error(500, 'internal');
    }
  },
} satisfies ExportedHandler<Env>;

export class VaultWatcher {}
export { TxSender } from "./txSender";
