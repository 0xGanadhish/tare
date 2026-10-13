import { isAddress } from 'viem';
import { isNetwork } from '../../../../shared/networks';
import { readPositions, toJson } from '../../../../lib/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/positions/:owner?network=testnet|mainnet (default testnet). */
export async function GET(request: Request, context: { params: Promise<{ address: string }> }): Promise<Response> {
  const { address } = await context.params;
  if (!isAddress(address)) return Response.json({ error: 'Not a valid Monad address' }, { status: 400 });
  const param = new URL(request.url).searchParams.get('network') ?? 'testnet';
  if (!isNetwork(param)) return Response.json({ error: 'Unknown network' }, { status: 400 });
  try {
    return Response.json({ positions: (await readPositions(param, address)).map(toJson) });
  } catch {
    return Response.json({ error: 'Could not read positions' }, { status: 503 });
  }
}
