import { parseIntent } from '../../../lib/intent';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'Provide non-empty text' }, { status: 400 });
  }
  try {
    return Response.json(await parseIntent(body.text));
  } catch {
    return Response.json({ error: 'Could not parse intent' }, { status: 503 });
  }
}
