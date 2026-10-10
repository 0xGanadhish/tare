import { readMarket } from '../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const market = await readMarket();
    const params = new URL(request.url).searchParams;
    const asset = params.get('asset');
    const protocol = params.get('protocol');
    const pools = market.pools.filter((pool) => (!asset || pool.assetClass === asset) && (!protocol || pool.project === protocol));
    const verdicts = Object.fromEntries(pools.filter((pool) => market.verdicts[pool.id]).map((pool) => [pool.id, market.verdicts[pool.id]]));
    return Response.json({ pools, verdicts, asOf: market.asOf });
  } catch {
    return Response.json({ error: 'Could not read pool data' }, { status: 503 });
  }
}
