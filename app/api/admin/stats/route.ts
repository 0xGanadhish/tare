import { isAddress } from 'viem';
import { addresses } from '../../../../shared/contracts';
import { sendSetStats } from '../../../../worker/operator';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const token = process.env.ADMIN_TOKEN;
  if (!token || request.headers.get('x-admin-token') !== token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('vault' in body) || typeof body.vault !== 'string' || !isAddress(body.vault)
    || !('apyBps' in body) || typeof body.apyBps !== 'number' || !Number.isInteger(body.apyBps) || body.apyBps < 0 || body.apyBps > 65535
    || !('utilBps' in body) || typeof body.utilBps !== 'number' || !Number.isInteger(body.utilBps) || body.utilBps < 0 || body.utilBps > 10000) {
    return Response.json({ error: 'Provide a valid vault and integer stats (APY 0–65535, utilization 0–10000)' }, { status: 400 });
  }
  const { vault, apyBps, utilBps } = body;
  const mirrors = addresses.mirrors ?? [];
  if (mirrors.length === 0) return Response.json({ error: 'Mirrors are not deployed' }, { status: 503 });
  if (!mirrors.some((mirror) => mirror.address.toLowerCase() === vault.toLowerCase())) {
    return Response.json({ error: 'Vault is not an approved mirror' }, { status: 400 });
  }
  try {
    const result = await sendSetStats(vault, { apyBps, utilBps });
    return Response.json({ ...result, block: result.block.toString() });
  } catch {
    return Response.json({ error: 'Could not confirm stats transaction' }, { status: 502 });
  }
}
