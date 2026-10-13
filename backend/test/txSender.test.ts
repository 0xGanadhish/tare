import { env, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { NonceSender } from '../src/txSender';
import { FakeChain } from './fakes';

const TO = '0x00000000000000000000000000000000000000c0' as const;

async function withSender<T>(chain: FakeChain, fn: (s: NonceSender) => Promise<T>): Promise<T> {
  const stub = env.TX_SENDER.get(env.TX_SENDER.idFromName(`testnet:attester:${crypto.randomUUID()}`));
  return runInDurableObject(stub, async (_instance, state) =>
    fn(new NonceSender({ storage: state.storage, db: env.DB, chain, network: 'testnet', role: 'attester' })));
}

describe('TxSender', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM tx_log;'); });

  it('TxSender assigns sequential nonces under 5 concurrent sends', async () => {
    const chain = new FakeChain();
    chain.chainNonce = 7;
    const results = await withSender(chain, (s) =>
      Promise.all(Array.from({ length: 5 }, () => s.send({ to: TO, data: '0x01', kind: 'post' }))));
    expect(chain.sent.map((t) => t.nonce)).toEqual([7, 8, 9, 10, 11]);
    expect(new Set(results.map((r) => r.hash)).size).toBe(5);
    const { results: rows } = await env.DB.prepare('SELECT nonce FROM tx_log ORDER BY nonce').all<{ nonce: number }>();
    expect(rows.map((r) => r.nonce)).toEqual([7, 8, 9, 10, 11]);
  });

  it('TxSender sets gas limit to ceil(estimate*1.15)', async () => {
    const chain = new FakeChain();
    chain.gasEstimate = 100_001n;
    await withSender(chain, (s) => s.send({ to: TO, data: '0x01', kind: 'exit' }));
    expect(chain.sent[0].gas).toBe(115_002n); // 115001.15 rounds up
  });

  it('TxSender resyncs nonce after "nonce too low"', async () => {
    const chain = new FakeChain();
    await withSender(chain, async (s) => {
      await s.send({ to: TO, data: '0x01', kind: 'post' }); // stored nonce is now 1
      chain.chainNonce = 5; // someone else used this key
      const r = await s.send({ to: TO, data: '0x02', kind: 'post' });
      expect(r.status).toBe('success');
      await s.send({ to: TO, data: '0x03', kind: 'post' });
    });
    expect(chain.sent.map((t) => t.nonce)).toEqual([0, 5, 6]);
  });

  it('TxSender records reverted receipts as status reverted', async () => {
    const chain = new FakeChain();
    chain.receiptStatus = 'reverted';
    const r = await withSender(chain, (s) => s.send({ to: TO, data: '0x01', kind: 'resolve' }));
    expect(r.status).toBe('reverted');
    const row = await env.DB.prepare('SELECT status, kind, key_role, network FROM tx_log').first();
    expect(row).toEqual({ status: 'reverted', kind: 'resolve', key_role: 'attester', network: 'testnet' });
  });

  it('an accepted tx whose response was lost is not sent twice', async () => {
    const chain = new FakeChain();
    chain.acceptButFailWith = 'already known';
    const r = await withSender(chain, (s) => s.send({ to: TO, data: '0x01', kind: 'post' }));
    expect(chain.sent.map((t) => t.nonce)).toEqual([0]);
    expect(r.status).toBe('success');
  });

  it('a receipt timeout reports pending with the hash instead of throwing', async () => {
    const chain = new FakeChain();
    chain.receiptTimeout = true;
    const r = await withSender(chain, (s) => s.send({ to: TO, data: '0x01', kind: 'exit' }));
    expect(r.status).toBe('pending');
    expect(r.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await env.DB.prepare('SELECT status FROM tx_log').first('status')).toBe('pending');
  });

  it('a failed estimate does not burn a nonce', async () => {
    const chain = new FakeChain();
    await withSender(chain, async (s) => {
      chain.estimateError = new Error('execution reverted');
      await expect(s.send({ to: TO, data: '0x01', kind: 'exit' })).rejects.toThrow('execution reverted');
      chain.estimateError = null;
      await s.send({ to: TO, data: '0x01', kind: 'exit' });
    });
    expect(chain.sent.map((t) => t.nonce)).toEqual([0]);
  });
});
