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
});
