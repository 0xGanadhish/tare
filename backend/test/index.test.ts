import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { CRON_RESOLVE, CRON_SCAN, jobsFor } from '../src/index';

describe('worker entry', () => {
  it('maps each cron to its job', () => {
    expect(jobsFor(CRON_SCAN)).toEqual(['scanPools']);
    expect(jobsFor(CRON_RESOLVE)).toEqual(['resolveDue']);
    expect(jobsFor('0 0 * * *')).toEqual([]);
  });

  it('serves /health', async () => {
    const res = await SELF.fetch('https://backend.test/health');
    expect([200, 503]).toContain(res.status);
    expect(await res.json()).toHaveProperty('ok');
  });

  it('serves /v1/health with the same body as /health', async () => {
    const res = await SELF.fetch('https://backend.test/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(await res.json()).toHaveProperty('ok');
  });

  it('serves a JSON index at /', async () => {
    const res = await SELF.fetch('https://backend.test/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json<{ name: string; version: string; routes: string[]; links: Record<string, string> }>();
    expect(body.name).toBe('Tare API');
    expect(body.version).toBe('v1');
    expect(body.routes).toContain('GET /v1/verdicts?network={testnet|mainnet}');
    expect(body.routes).toContain('GET /v1/health');
    expect(body.routes.some((r) => r.includes('/admin'))).toBe(false);
    expect(body.links.app).toBe('https://tarefi.xyz');
  });

  it('still 404s unknown paths', async () => {
    expect((await SELF.fetch('https://backend.test/v2/verdicts')).status).toBe(404);
  });
});
