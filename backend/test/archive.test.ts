import { env } from 'cloudflare:test';
import { encodeAbiParameters, encodeEventTopics, keccak256, toBytes, type Hex } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { abis } from '../../shared/contracts';
import { NETWORKS } from '../../shared/networks';
import { stateHash, type StateDocument } from '../../shared/verdict';
import type { PositionJudgment } from '../../shared/types';
import { archiveState, postVerdict } from '../src/archive';
import type { Env } from '../src/env';
import type { SendRequest, SendResult, Sender } from '../src/txSender';

const VAULT = '0x7504b078d1f2b90fb9fcaf3d22753311013ea0ac' as const;

const doc = (over: Partial<StateDocument> = {}): StateDocument => ({
  v: 1, network: 'testnet', vault: VAULT, state: 'Holding 1,000 USDC in Clearstar USDC · Euler (mirror).',
  questions: { withdrawal_risk: { type: 'noul', instructions: 'x' } }, answers: { withdrawal_risk: { type: 'noul', noul: 0.4 } },
  model: 'jev-latest', at: '2026-10-11T18:00:00.000Z', drill: false, ...over,
});

const judgment: PositionJudgment = { action: { value: 'exit', confidence: 0.92 }, withdrawalRisk: 0.41, yieldCollapse: 0.1, statsHash: 'h', at: '2026-10-11T18:00:00.000Z' };

function verdictPostedLog(id: bigint, hash: Hex, postedAt: bigint) {
  return {
    address: NETWORKS.testnet.oracle,
    topics: encodeEventTopics({ abi: abis.oracle, eventName: 'VerdictPosted', args: { id, vault: VAULT } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: 'uint8' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'bytes32' }, { type: 'uint64' }], [1, 9200, 4100, hash, postedAt]),
  };
}

class FakeOracleSender implements Sender {
  requests: SendRequest[] = [];
  constructor(private readonly onSend: (req: SendRequest) => Promise<SendResult>) {}
  send(req: SendRequest) { this.requests.push(req); return this.onSend(req); }
}

function countingEnv(): { env: Env; puts: () => number } {
  let puts = 0;
  const bucket = new Proxy(env.STATE, {
    get(target, prop) {
      if (prop === 'put') return (...args: Parameters<R2Bucket['put']>) => { puts++; return target.put(...args); };
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { env: { ...env, STATE: bucket }, puts: () => puts };
}

describe('state archive', () => {
  beforeEach(async () => { await env.DB.exec('DELETE FROM posts;'); });

  it('archiveState: re-hashing the stored R2 body equals the returned hash', async () => {
    const d = doc();
    const hash = await archiveState(env, d);
    expect(hash).toBe(stateHash(d));
    const obj = await env.STATE.get(`state/${hash}.json`);
    expect(obj?.httpMetadata?.contentType).toBe('application/json');
    expect(keccak256(toBytes(await obj!.text()))).toBe(hash);
  });

  it('archiveState twice writes once', async () => {
    const { env: e, puts } = countingEnv();
    const d = doc({ state: 'twice' });
    await archiveState(e, d);
    await archiveState(e, d);
    expect(puts()).toBe(1);
  });

  it('postVerdict archives before sending', async () => {
    const d = doc({ state: 'order' });
    const hash = stateHash(d);
    const sender = new FakeOracleSender(async () => {
      expect(await env.STATE.head(`state/${hash}.json`)).not.toBeNull();
      return { hash: `0x${'11'.repeat(32)}`, status: 'success', blockNumber: 5n, gasUsed: 1n, logs: [verdictPostedLog(3n, hash, 1_760_000_000n)] };
    });
    await postVerdict(env, 'testnet', VAULT, judgment, d, sender);
    expect(sender.requests).toHaveLength(1);
    expect(sender.requests[0]).toMatchObject({ to: NETWORKS.testnet.oracle, kind: 'post' });
  });

  it('postVerdict stores the decoded id and drill flag in D1', async () => {
    const d = doc({ state: 'drill', drill: true });
    const hash = stateHash(d);
    const sender = new FakeOracleSender(async () => ({
      hash: `0x${'22'.repeat(32)}`, status: 'success', blockNumber: 5n, gasUsed: 1n, logs: [verdictPostedLog(42n, hash, 1_760_000_123n)],
    }));
    const result = await postVerdict(env, 'testnet', VAULT, judgment, d, sender);
    expect(result).toEqual({ id: 42n, txHash: `0x${'22'.repeat(32)}` });
    const row = await env.DB.prepare('SELECT * FROM posts WHERE network = ? AND id = ?').bind('testnet', 42).first();
    expect(row).toMatchObject({
      vault: VAULT.toLowerCase(), verdict: 1, confidence_bps: 9200, risk_bps: 4100, state_hash: hash,
      posted_at: 1_760_000_123, tx_hash: `0x${'22'.repeat(32)}`, resolved: 0, drill: 1,
    });
  });

  it('postVerdict throws on a reverted post and stores nothing', async () => {
    const sender = new FakeOracleSender(async () => ({ hash: `0x${'33'.repeat(32)}`, status: 'reverted', blockNumber: 5n, gasUsed: 1n, logs: [] }));
    await expect(postVerdict(env, 'testnet', VAULT, judgment, doc({ state: 'revert' }), sender)).rejects.toThrow(/reverted/);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM posts').first('n')).toBe(0);
  });
});
