import { isNetwork } from '../../../../shared/networks';
import { BackendUnavailable, ledgerSource } from '../../../../lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/ledger/score?network — the Scoreboard (backend /v1/ledger/score, or fixtures offline). */
export async function GET(request: Request): Promise<Response> {
  const network = new URL(request.url).searchParams.get('network');
  if (!isNetwork(network)) return Response.json({ error: 'Unknown network' }, { status: 400 });
  const src = ledgerSource();
  if (!src) return Response.json({ error: 'Ledger backend is not configured' }, { status: 503 });
  try {
    return Response.json({ score: await src.backend.score(network), source: src.source });
  } catch (err) {
    if (!(err instanceof BackendUnavailable)) throw err;
    return Response.json({ error: 'Ledger unavailable' }, { status: 503 });
  }
}
