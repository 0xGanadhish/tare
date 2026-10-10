import { describe, expect, test, vi } from 'vitest';
import { createWatchdog, type WatchdogDeps } from './watchdog';
import type { PositionJudgment, WatchEvent } from '../shared/types';

const V = '0x00000000000000000000000000000000000000a1' as const;
const O = '0x00000000000000000000000000000000000000b1' as const;
const TX = '0x1234' as const;

const judgment = (action: 'hold' | 'exit' | 'rotate', confidence: number): PositionJudgment => ({
  action: { value: action, confidence }, withdrawalRisk: 0.8, yieldCollapse: 0.7, statsHash: 'h', at: 'now',
});

function setup(over: Partial<WatchdogDeps> = {}, updates: Array<{ apyBps: number; utilBps: number }[]> = []) {
  const events: WatchEvent[] = [];
  const queue = updates.map((u) => u.map((s) => ({ vault: V, ...s })));
  const deps = {
    readStats: vi.fn(async () => queue.shift() ?? []),
    readEnabled: vi.fn(async () => [{ owner: O, vault: V }]),
    judge: vi.fn(async () => judgment('exit', 0.95)),
    exit: vi.fn(async () => ({ txHash: TX, seconds: 0.6, block: 1n, assets: 5n })),
    emit: vi.fn(async (e: WatchEvent) => { events.push(e); }),
    retryDelayMs: 0,
    ...over,
  } as WatchdogDeps;
  const wd = createWatchdog(deps);
  wd.seed([{ vault: V, apyBps: 630, utilBps: 7100 }]);
  return { wd, deps, types: () => events.map((e) => e.type), events };
}

describe('watchdog', () => {
  test('auto-exits when exit confidence ≥ 0.9 and autopilot is on', async () => {
    const { wd, deps, types } = setup({}, [[{ apyBps: 90, utilBps: 9200 }]]);
    await wd.tick();
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(V, O);
    expect(types()).toEqual(['stats_changed', 'judged', 'exit_sent', 'exit_confirmed']);
  });

  test('judged events carry the full PositionJudgment', async () => {
    const j = { ...judgment('exit', 0.95), withdrawalRisk: 0.8123456, yieldCollapse: 0.7654321 };
    const { wd, events } = setup({ judge: vi.fn(async () => j) }, [[{ apyBps: 90, utilBps: 9200 }]]);
    await wd.tick();
    const e = events.find((x) => x.type === 'judged')!;
    expect(e.judgment).toEqual(j);
    expect(e.message).toContain('Jev says exit (95% sure)');
  });

  test('alerts instead of exiting when confidence is 0.75', async () => {
    const { wd, deps, types } = setup({ judge: vi.fn(async () => judgment('exit', 0.75)) }, [[{ apyBps: 90, utilBps: 9200 }]]);
    await wd.tick();
    expect(deps.exit).not.toHaveBeenCalled();
    expect(types()).toContain('alert');
  });

  test('does not exit without autopilot even at high confidence', async () => {
    const { wd, deps, types } = setup({ readEnabled: vi.fn(async () => []) }, [[{ apyBps: 90, utilBps: 9200 }]]);
    await wd.tick();
    expect(deps.exit).not.toHaveBeenCalled();
    expect(types()).toContain('alert');
  });

  test('does not re-judge when util moved by only 300 bps', async () => {
    const { wd, deps } = setup({}, [[{ apyBps: 630, utilBps: 7400 }]]);
    await wd.tick();
    expect(deps.judge).not.toHaveBeenCalled();
  });

  test('records exit_failed when exit throws NothingToExit, retries at most 2 times', async () => {
    const exit = vi.fn(async () => { throw new Error('NothingToExit'); });
    const { wd, types, events } = setup({ exit }, [[{ apyBps: 90, utilBps: 9200 }]]);
    await wd.tick();
    expect(exit).toHaveBeenCalledTimes(3);
    expect(types().at(-1)).toBe('exit_failed');
    expect(events.at(-1)!.message).toContain('NothingToExit');
  });

  test('never exits when judge throws (Jev down); falls back to util > 9_500 alert', async () => {
    const judge = vi.fn(async () => { throw new Error('Jev down'); });
    const { wd, deps, types } = setup({ judge }, [[{ apyBps: 90, utilBps: 9600 }]]);
    await wd.tick();
    expect(deps.exit).not.toHaveBeenCalled();
    expect(types()).toContain('alert');
  });

  test('Jev down and util below 9_500 emits no alert', async () => {
    const judge = vi.fn(async () => { throw new Error('Jev down'); });
    const { wd, types } = setup({ judge }, [[{ apyBps: 90, utilBps: 9000 }]]);
    await wd.tick();
    expect(types()).not.toContain('alert');
  });
});
