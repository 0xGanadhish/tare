import { readMarket } from '../../../../lib/api';
import { readHistory } from '../../../../lib/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const { pools, verdicts } = await readMarket();
    const pool = pools.find((pool) => pool.id === id);
    if (!pool) return Response.json({ error: 'Pool not found' }, { status: 404 });
    return Response.json({ pool, verdict: verdicts[id] ?? null, history: await readHistory(id) });
  } catch {
    return Response.json({ error: 'Could not read pool data' }, { status: 503 });
  }
}
