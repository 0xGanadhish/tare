import { isAddress } from 'viem';
import { isNetwork } from '../../../../shared/networks';
import { BackendUnavailable, ledgerSource } from '../../../../lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/ledger/verdicts?network&vault&cursor&limit — the Ledger table (backend /v1/verdicts, or fixtures offline). */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const network = q.get('network');
  const vault = q.get('vault') || undefined;
  const cursor = q.get('cursor') || undefined;
  const limit = q.get('limit') ? Number(q.get('limit')) : undefined;
  if (!isNetwork(network)) return Response.json({ error: 'Unknown network' }, { status: 400 });
  if (vault && !isAddress(vault)) return Response.json({ error: 'Not a valid vault address' }, { status: 400 });
  if ((cursor && !/^\d+$/.test(cursor)) || (limit !== undefined && !Number.isInteger(limit))) return Response.json({ error: 'Bad paging' }, { status: 400 });
  const src = ledgerSource();
  if (!src) return Response.json({ error: 'Ledger backend is not configured' }, { status: 503 });
  try {
    return Response.json({ ...(await src.backend.verdicts({ network, vault, cursor, limit })), source: src.source });
  } catch (err) {
    if (!(err instanceof BackendUnavailable)) throw err;
    return Response.json({ error: 'Ledger unavailable' }, { status: 503 });
  }
}
