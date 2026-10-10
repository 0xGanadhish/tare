import { isAddress } from 'viem';
import { readPositions } from '../../../../lib/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }): Promise<Response> {
  const { address } = await context.params;
  if (!isAddress(address)) return Response.json({ error: 'Not a valid Monad address' }, { status: 400 });
  try {
    return Response.json({ positions: await readPositions(address) });
  } catch {
    return Response.json({ error: 'Could not read positions' }, { status: 503 });
  }
}
