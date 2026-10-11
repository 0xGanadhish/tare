import { isAddress } from 'viem';
import { readEvents } from '../../../../shared/cache';
import { isNetwork, NETWORKS } from '../../../../shared/networks';
import { BackendUnavailable, serverBackend } from '../../../../lib/backend';
import { fromBackend, fromWatchEvent } from '../../../../components/watch/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/watch/events?network&owner&since — the Watch feed. Proxies the backend's /v1/events when BACKEND_URL is set;
 * otherwise testnet reads the local v1 worker cache (dev and fixtures runs) and mainnet has no feed.
 */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const network = q.get('network') ?? 'testnet';
  const owner = q.get('owner') ?? '';
  const since = q.get('since') ?? undefined;
  if (!isNetwork(network)) return Response.json({ error: 'Unknown network' }, { status: 400 });
  if (!isAddress(owner)) return Response.json({ error: 'Not a valid Monad address' }, { status: 400 });

  const backend = serverBackend();
  if (backend) {
    try {
      return Response.json({ events: (await backend.events(network, owner, since)).map(fromBackend) });
    } catch (err) {
      if (!(err instanceof BackendUnavailable)) throw err;
      return Response.json({ error: 'Events unavailable' }, { status: 503 });
    }
  }
  if (network !== 'testnet') return Response.json({ events: [] });
  const vaults = new Set(NETWORKS.testnet.vaults.map((v) => v.address.toLowerCase()));
  const mine = (await readEvents()).filter((e) =>
    (e.owner ? e.owner.toLowerCase() === owner.toLowerCase() : vaults.has(e.vault.toLowerCase())) && (!since || e.at > since));
  return Response.json({ events: mine.map(fromWatchEvent) });
}
