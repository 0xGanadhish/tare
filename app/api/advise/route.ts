import { advise } from '../../../lib/advisor';
import { isIntent, readMarket } from '../../../lib/api';
import { addresses } from '../../../shared/contracts';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('intent' in body) || !isIntent(body.intent)) {
    return Response.json({ error: 'Provide a valid intent' }, { status: 400 });
  }
  try {
    const { pools, verdicts } = await readMarket();
    return Response.json({ recommendations: advise(body.intent, pools, verdicts, addresses.mirrors ?? []) });
  } catch {
    return Response.json({ error: 'Could not read recommendations' }, { status: 503 });
  }
}
