import { expect, test } from 'vitest';
import { OracleVerdict, stateHash, toOraclePost, type StateDocument } from './verdict';
import type { PositionJudgment } from './types';

const judgment = (value: 'hold' | 'exit' | 'rotate', confidence: number, withdrawalRisk: number): PositionJudgment =>
  ({ action: { value, confidence }, withdrawalRisk, yieldCollapse: 0.1, statsHash: 'x', at: '2026-10-11T00:00:00Z' });

test('toOraclePost maps Jev actions onto oracle verdicts', () => {
  expect(toOraclePost(judgment('hold', 0.7, 0.1)).verdict).toBe(OracleVerdict.HOLD);
  expect(toOraclePost(judgment('exit', 0.95, 0.8))).toEqual({ verdict: OracleVerdict.EXIT, confidenceBps: 9500, riskBps: 8000 });
  expect(toOraclePost(judgment('rotate', 0.6, 0.2)).verdict).toBe(OracleVerdict.MOVE);
});

test('toOraclePost clamps out-of-range probabilities to 0..10000', () => {
  expect(toOraclePost(judgment('exit', 1.2, -0.1))).toMatchObject({ confidenceBps: 10000, riskBps: 0 });
});

const doc: StateDocument = { v: 1, network: 'testnet', vault: '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC', state: 'Holding 500 USDC',
  questions: { a: 1, b: [1, 2] }, answers: { z: { y: 1, x: 2 } }, model: 'jev-latest', at: '2026-10-11T00:00:00Z', drill: false };

test('stateHash is stable across key order', () => {
  const reordered = JSON.parse(JSON.stringify({ drill: false, at: doc.at, model: doc.model, answers: { z: { x: 2, y: 1 } },
    questions: { b: [1, 2], a: 1 }, state: doc.state, vault: doc.vault, network: doc.network, v: 1 })) as StateDocument;
  expect(stateHash(reordered)).toBe(stateHash(doc));
  expect(stateHash(doc)).toMatch(/^0x[0-9a-f]{64}$/);
});

test('stateHash changes when the content changes', () => {
  expect(stateHash({ ...doc, drill: true })).not.toBe(stateHash(doc));
});

test('oracle and GuardianV2 ABIs expose the functions the backend and app call', async () => {
  const { abis } = await import('./contracts');
  const names = (abi: readonly { type: string; name?: string }[]) => abi.filter((x) => x.type === 'function').map((x) => x.name);
  expect(names(abis.oracle)).toEqual(expect.arrayContaining(['post', 'resolve', 'latest', 'getPost', 'getResolution']));
  expect(names(abis.guardianV2)).toEqual(expect.arrayContaining(['enable', 'disable', 'exit', 'rules']));
});
