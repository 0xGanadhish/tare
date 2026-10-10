import { isAddress } from 'viem';
import { scanAddress } from '../../../../lib/idle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }): Promise<Response> {
  const { address } = await context.params;
  if (!isAddress(address)) return Response.json({ error: 'Not a valid Monad address' }, { status: 400 });
  try {
    return Response.json(await scanAddress(address));
  } catch {
    return Response.json({ error: "Couldn't read this wallet" }, { status: 503 });
  }
}
