import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import { encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { abis } from '../../shared/contracts';
import { NETWORKS } from '../../shared/networks';
import type { ExitJob } from '../src/env';
import { handleExitBatch, type ExitDeps } from '../src/exits';
import type { SendRequest, SendResult } from '../src/txSender';

const VAULT = '0x7504b078d1f2b90fb9fcaf3d22753311013ea0ac' as const;
const OWNER = '0x00000000000000000000000000000000000000a1' as const;
const job: ExitJob = { network: 'testnet', vault: VAULT, owner: OWNER, verdictId: '7' };

function exitedLog(shares: bigint, assets: bigint, remainingShares: bigint) {
  return {
    address: NETWORKS.testnet.guardian,
    topics: encodeEventTopics({ abi: abis.guardianV2, eventName: 'Exited', args: { owner: OWNER, vault: VAULT, verdictId: 7n } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
      ['0x00000000000000000000000000000000000000e1', shares, assets, remainingShares]),
  };
}

function fakeDeps(over: Partial<ExitDeps> = {}) {
  const sent: SendRequest[] = [];
  const deps: ExitDeps = {
    simulate: async () => null,
    receipt: async () => null,
    sender: () => ({
      send: async (req: SendRequest): Promise<SendResult> => {
        sent.push(req);
        return { hash: `0x${'aa'.repeat(32)}`, status: 'success', blockNumber: 1n, gasUsed: 1n, logs: [exitedLog(1_000_000_000n, 1_000_000_000n, 0n)] };
      },
    }),
    ...over,
  };
  return { deps, sent };
}

async function run(messages: { body: ExitJob; attempts?: number }[], deps: ExitDeps) {
  const batch = createMessageBatch<ExitJob>('tare-exits', messages.map((m, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: m.attempts ?? 1, body: m.body })));
  const ctx = createExecutionContext();
  // The test batch drops retry options from its result, so record them on the way through.
  const retries: { msgId: string; delaySeconds?: number }[] = [];
  for (const m of batch.messages) {
    const retry = m.retry.bind(m);
    m.retry = (opts) => { retries.push({ msgId: m.id, delaySeconds: opts?.delaySeconds }); retry(opts); };
  }
  await handleExitBatch(batch, env, deps);
  return { ...(await getQueueResult(batch, ctx)), retryMessages: retries };
}

const eventsOf = async () => (await env.DB.prepare('SELECT type, message, owner FROM events ORDER BY at').all<{ type: string; message: string; owner: string }>()).results;

describe('exit consumer', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM exits; DELETE FROM events;'); });

  it('exit consumer: same message twice sends one tx', async () => {
    const { deps, sent } = fakeDeps();
    await run([{ body: job }], deps);
    const second = await run([{ body: job }], deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: NETWORKS.testnet.guardian, kind: 'exit' });
    expect(second.explicitAcks).toEqual(['m0']);
    const row = await env.DB.prepare('SELECT status, tx_hash, assets, remaining_shares FROM exits').first();
    expect(row).toEqual({ status: 'confirmed', tx_hash: `0x${'aa'.repeat(32)}`, assets: '1000000000', remaining_shares: '0' });
    expect((await eventsOf()).map((e) => [e.type, e.message])).toEqual([['exit_confirmed', "You're out"]]);
  });

  it('same message twice in one batch sends one tx', async () => {
    const { deps, sent } = fakeDeps();
    await run([{ body: job }, { body: job }], deps);
    expect(sent).toHaveLength(1);
  });

  it('simulated StaleVerdict → skipped with reason, no send', async () => {
    const { deps, sent } = fakeDeps({ simulate: async () => 'StaleVerdict' });
    const result = await run([{ body: job }], deps);
    expect(sent).toHaveLength(0);
    expect(result.explicitAcks).toEqual(['m0']);
    expect(await env.DB.prepare('SELECT status, error FROM exits').first()).toEqual({ status: 'skipped', error: 'StaleVerdict' });
    expect((await eventsOf())[0]).toMatchObject({ type: 'exit_failed', message: expect.stringContaining('StaleVerdict') });
  });

  it('partial exit → event says "Partly out"', async () => {
    const { deps } = fakeDeps({
      sender: () => ({ send: async () => ({ hash: `0x${'bb'.repeat(32)}`, status: 'success', blockNumber: 1n, gasUsed: 1n, logs: [exitedLog(600_000_000n, 600_000_000n, 400_000_000n)] }) }),
    });
    await run([{ body: job }], deps);
    const [event] = await eventsOf();
    expect(event).toMatchObject({ type: 'exit_partial', owner: OWNER, message: 'Partly out: 400 USDC still locked' });
  });

  it('send throws → retried with backoff', async () => {
    const { deps } = fakeDeps({ sender: () => ({ send: async () => { throw new Error('rpc timeout'); } }) });
    const result = await run([{ body: job, attempts: 2 }], deps);
    expect(result.retryMessages).toEqual([{ msgId: 'm0', delaySeconds: 4 }]);
    expect(await env.DB.prepare('SELECT status FROM exits').first('status')).toBe('failed');
    expect(await eventsOf()).toEqual([]);
  });

  it('after 3 attempts → failed and exit_failed event', async () => {
    const { deps } = fakeDeps({ sender: () => ({ send: async () => { throw new Error('rpc timeout'); } }) });
    const result = await run([{ body: job, attempts: 3 }], deps);
    expect(result.retryMessages).toEqual([]);
    expect(result.explicitAcks).toEqual(['m0']);
    expect((await eventsOf()).map((e) => e.type)).toEqual(['exit_failed']);
    expect((await eventsOf())[0].message).toContain('rpc timeout');
  });

  it('simulated VerdictAlreadyUsed → skipped, no send', async () => {
    const { deps, sent } = fakeDeps({ simulate: async () => 'VerdictAlreadyUsed' });
    await run([{ body: job }], deps);
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare('SELECT status, error FROM exits').first()).toEqual({ status: 'skipped', error: 'VerdictAlreadyUsed' });
  });

  it('benign reverts (already out) are skipped quietly', async () => {
    for (const reason of ['NothingToExit', 'NotEnabled']) {
      await env.DB.exec('DELETE FROM exits; DELETE FROM events;');
      const { deps } = fakeDeps({ simulate: async () => reason });
      await run([{ body: job }], deps);
      expect(await env.DB.prepare('SELECT status FROM exits').first('status')).toBe('skipped');
      expect(await eventsOf()).toEqual([]);
    }
  });

  it('a fresh claim held by another delivery waits past the stale-claim window', async () => {
    await env.DB.prepare(`INSERT INTO exits (network, verdict_id, owner, status, at) VALUES ('testnet', '7', ?, 'sending', ?)`).bind(OWNER, new Date().toISOString()).run();
    const { deps, sent } = fakeDeps();
    const result = await run([{ body: job, attempts: 2 }], deps);
    expect(sent).toHaveLength(0);
    expect(result.retryMessages[0].delaySeconds).toBeGreaterThanOrEqual(120);
  });

  it('a pending send is stored as sent, and the retry confirms from its receipt without sending again', async () => {
    let calls = 0;
    const pendingHash = `0x${'ee'.repeat(32)}` as Hex;
    const { deps, sent } = fakeDeps({
      sender: () => ({ send: async (r: SendRequest) => { calls++; sent.push(r); return { hash: pendingHash, status: 'pending', blockNumber: 0n, gasUsed: 0n, logs: [] }; } }),
      receipt: async (_n, hash) => (hash === pendingHash ? { status: 'success', blockNumber: 2n, gasUsed: 1n, logs: [exitedLog(5n, 5n, 0n)] } : null),
    });
    const first = await run([{ body: job, attempts: 1 }], deps);
    expect(first.retryMessages).toHaveLength(1);
    expect(await env.DB.prepare('SELECT status, tx_hash FROM exits').first()).toEqual({ status: 'sent', tx_hash: pendingHash });
    await run([{ body: job, attempts: 2 }], deps);
    expect(calls).toBe(1);
    expect(await env.DB.prepare('SELECT status FROM exits').first('status')).toBe('confirmed');
    expect((await eventsOf()).map((e) => e.type)).toEqual(['exit_confirmed']);
  });

  it('error text never carries the RPC URL into the Watch feed', async () => {
    const { deps } = fakeDeps({ sender: () => ({ send: async () => { throw new Error('HTTP request failed. URL: https://monad-testnet.g.alchemy.com/v2/SECRETKEY'); } }) });
    await run([{ body: job, attempts: 3 }], deps);
    const [event] = await eventsOf();
    expect(event.type).toBe('exit_failed');
    expect(event.message).not.toContain('SECRETKEY');
    expect(await env.DB.prepare('SELECT error FROM exits').first('error')).not.toContain('SECRETKEY');
  });

  it('a retry after a failed attempt sends again', async () => {
    let calls = 0;
    const { deps } = fakeDeps();
    const flaky = { ...deps, sender: () => ({ send: async (req: SendRequest) => { if (calls++ === 0) throw new Error('rpc'); return deps.sender('testnet').send(req); } }) };
    await run([{ body: job, attempts: 1 }], flaky);
    await run([{ body: job, attempts: 2 }], flaky);
    expect(await env.DB.prepare('SELECT status FROM exits').first('status')).toBe('confirmed');
  });
});
