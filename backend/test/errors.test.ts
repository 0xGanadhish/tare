import { HttpRequestError, TimeoutError } from 'viem';
import { describe, expect, it } from 'vitest';
import { safeError } from '../src/errors';

const URL = 'https://monad-mainnet.g.alchemy.com/v2/SECRETKEY123';

describe('safeError', () => {
  it('drops RPC URLs (and the key in their path) from viem errors', () => {
    for (const err of [new HttpRequestError({ url: URL, status: 429, body: { method: 'eth_call' } }), new TimeoutError({ body: {}, url: URL })]) {
      const text = safeError(err);
      expect(text).not.toContain('SECRETKEY123');
      expect(text).not.toContain('alchemy');
      expect(text.length).toBeLessThanOrEqual(200);
    }
  });

  it('scrubs URLs from plain errors and keeps the useful part', () => {
    expect(safeError(new Error(`fetch failed for ${URL} (timeout)`))).toBe('fetch failed for [url] (timeout)');
    expect(safeError('StaleVerdict')).toBe('StaleVerdict');
  });
});
