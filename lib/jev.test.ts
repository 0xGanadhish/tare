import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jev, JevUnavailable } from './jev';
const questions = { urgent: { type: 'noul' as const, instructions: 'Is it urgent?' } };
beforeEach(() => vi.stubEnv('TYPESAFE_API_KEY', 'unit-test'));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

test('returns typed answers from the documented envelope', async () => {
  const answers = { urgent: { type: 'noul', noul: 0.7 } };
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ answers }));
  expect(await jev('state', questions, { fetchImpl })).toEqual(answers);
});
test.each([
  new Response('oops'), Response.json({ answers: {} }), Response.json({ answers: { urgent: { type: 'noul', noul: 2 } } }),
  new Response('', { status: 503 }),
])('throws JevUnavailable on HTTP or malformed answer', async (response) => {
  await expect(jev('state', questions, { fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) })).rejects.toBeInstanceOf(JevUnavailable);
});
test('deadline covers fetch even when it ignores abort', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.withResolvers<Response>().promise);
  const result = expect(jev('state', questions, { fetchImpl, timeoutMs: 50 })).rejects.toBeInstanceOf(JevUnavailable);
  await vi.advanceTimersByTimeAsync(50);
  await result;
});
test('deadline also covers reading the response body', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.withResolvers<unknown>().promise } as Response);
  const result = expect(jev('state', questions, { fetchImpl, timeoutMs: 50 })).rejects.toBeInstanceOf(JevUnavailable);
  await vi.advanceTimersByTimeAsync(50);
  await result;
});
test('missing API key fails without calling fetch', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', '');
  const fetchImpl = vi.fn<typeof fetch>();
  await expect(jev('state', questions, { fetchImpl })).rejects.toBeInstanceOf(JevUnavailable);
  expect(fetchImpl).not.toHaveBeenCalled();
});
