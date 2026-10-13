import { advise, covered } from '../../../lib/advisor';
import { isIntent, readMarket } from '../../../lib/api';
import { addresses } from '../../../shared/contracts';
import { isNetwork, NETWORKS } from '../../../shared/networks';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('intent' in body) || !isIntent(body.intent)) {
    return Response.json({ error: 'Provide a valid intent' }, { status: 400 });
  }
  const network = 'network' in body ? body.network : undefined;
  if (network !== undefined && !isNetwork(network)) return Response.json({ error: 'Unknown network' }, { status: 400 });
  try {
    const { pools, verdicts } = await readMarket();
    const mirrors = addresses.mirrors ?? [];
    const recommendations = advise(body.intent, pools, verdicts, mirrors);
    // The vaults Tare can deposit into on this network, so the Advisor always offers one with Guardian.
    const poolIds = network ? NETWORKS[network].vaults.flatMap((v) => (v.poolId ? [v.poolId] : [])) : [];
    const exclude = recommendations.map((r) => r.pool.id);
    return Response.json({ recommendations, covered: covered(body.intent, pools, verdicts, mirrors, poolIds, exclude) });
  } catch {
    return Response.json({ error: 'Could not read recommendations' }, { status: 503 });
  }
}
