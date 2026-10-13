const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status, headers: { 'content-type': 'application/json', ...CORS },
  });
}

export const error = (status: number, code: string) => json({ error: code }, status);
export const preflight = () => new Response(null, { status: 204, headers: CORS });
