import { describe, expect, it } from 'vitest';
import { OracleVerdict } from '../../shared/verdict';
import { afterJudgment, decide, OUTFLOW_COOLDOWN_S } from '../src/decide';

const stats = (utilBps: number, apyBps = 500) => ({ apyBps, utilBps, liquidityPct: null });
const flows = (netOutPctTvl: number) => ({ netOutUsd: 1, netOutPctTvl, largestOutUsd: 1 });
const A = '0x00000000000000000000000000000000000000a1' as const;
const B = '0x00000000000000000000000000000000000000b2' as const;

describe('decide', () => {
  it('decide: first run rejudges', () => {
    expect(decide({ stats: stats(5000), last: null, flows: null, lastPostAgeS: null })).toBe('rejudge');
  });
  it('decide: no post yet rejudges even with unchanged stats', () => {
    expect(decide({ stats: stats(5000), last: stats(5000), flows: null, lastPostAgeS: null })).toBe('rejudge');
  });
  it('decide: util +600 bps rejudges', () => {
    expect(decide({ stats: stats(5600), last: stats(5000), flows: null, lastPostAgeS: 7_200 })).toBe('rejudge');
  });
  it('decide: util +400 bps skips', () => {
    expect(decide({ stats: stats(5400), last: stats(5000), flows: null, lastPostAgeS: 7_200 })).toBe('skip');
  });
  it('decide: outflow 12% rejudges', () => {
    expect(decide({ stats: stats(5000), last: stats(5000), flows: flows(12), lastPostAgeS: 7_200 })).toBe('rejudge');
  });
  it('decide: outflow 12% within the cooldown skips', () => {
    expect(decide({ stats: stats(5000), last: stats(5000), flows: flows(12), lastPostAgeS: OUTFLOW_COOLDOWN_S - 1 })).toBe('skip');
  });
  it('decide: outflow 12% at the cooldown rejudges', () => {
    expect(decide({ stats: stats(5000), last: stats(5000), flows: flows(12), lastPostAgeS: OUTFLOW_COOLDOWN_S })).toBe('rejudge');
  });
  it('decide: a stats move rejudges even within the cooldown', () => {
    expect(decide({ stats: stats(5600), last: stats(5000), flows: flows(12), lastPostAgeS: 30 })).toBe('rejudge');
  });
  it('decide: outflow 10% exactly skips', () => {
    expect(decide({ stats: stats(5000), last: stats(5000), flows: flows(10), lastPostAgeS: 7_200 })).toBe('skip');
  });
});

describe('afterJudgment', () => {
  const protections = [{ owner: A, minConfidenceBps: 9000 }, { owner: B, minConfidenceBps: 9500 }];
  it('afterJudgment: EXIT 9200 enqueues owners with min 9000 but not 9500', () => {
    expect(afterJudgment({ verdict: OracleVerdict.EXIT, confidenceBps: 9200 }, protections)).toEqual({ enqueue: [A], alert: true });
  });
  it('afterJudgment: HOLD enqueues nobody', () => {
    expect(afterJudgment({ verdict: OracleVerdict.HOLD, confidenceBps: 9900 }, protections)).toEqual({ enqueue: [], alert: false });
  });
  it('afterJudgment: EXIT below 6000 neither enqueues nor alerts', () => {
    expect(afterJudgment({ verdict: OracleVerdict.EXIT, confidenceBps: 5999 }, protections)).toEqual({ enqueue: [], alert: false });
  });
});
