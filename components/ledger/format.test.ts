import { describe, expect, test } from 'vitest';
import { decodeReasons, MIN_BAND_VERDICTS, outcomeOf, scoreSummary, verdictCount, verdictLabel } from './format';

describe('ledger formatting', () => {
  test('decodes the reasons bitmask in a fixed order', () => {
    expect(decodeReasons(0)).toEqual([]);
    expect(decodeReasons(1)).toEqual(['price drop']);
    expect(decodeReasons(2 | 4)).toEqual(['TVL drop', 'liquidity']);
    expect(decodeReasons(8)).toEqual(['vault unreadable']);
    expect(decodeReasons(null)).toEqual([]);
  });
  test('outcome is pending until resolved, then adverse or clear', () => {
    expect(outcomeOf({ resolved: false, adverse: null, reasons: null })).toEqual({ kind: 'pending', reasons: [] });
    expect(outcomeOf({ resolved: true, adverse: true, reasons: 5 })).toEqual({ kind: 'adverse', reasons: ['price drop', 'liquidity'] });
    expect(outcomeOf({ resolved: true, adverse: false, reasons: 0 })).toEqual({ kind: 'clear', reasons: [] });
  });
  test('maps the oracle enum to labels', () => {
    expect([0, 1, 2, 7].map(verdictLabel)).toEqual(['HOLD', 'EXIT', 'MOVE', 'HOLD']);
  });
});

describe('scoreboard summary', () => {
  const bands = (ns: [number, number][]) =>
    (['<80', '80-89', '90-94', '95-100'] as const).map((band, i) => ({ band, n: ns[i][0], hitRate: ns[i][0] ? ns[i][1] / ns[i][0] : null }));
  test('counts right calls across bands and says it in one sentence', () => {
    const s = scoreSummary({ n: 15, brier: 0.349, early: true, bands: bands([[3, 3], [5, 3], [1, 0], [6, 4]]) }, 'testnet');
    expect(s).toEqual({ right: 10, graded: 15, sentence: 'Jev was right 10 of 15 times.' });
  });
  test('one graded verdict reads in the singular', () => {
    expect(scoreSummary({ n: 1, brier: 0, early: true, bands: bands([[1, 1], [0, 0], [0, 0], [0, 0]]) }, 'mainnet').sentence).toBe('Jev was right 1 of 1 time.');
  });
  test('says so when nothing is graded yet', () => {
    expect(scoreSummary({ n: 0, brier: null, early: true, bands: bands([[0, 0], [0, 0], [0, 0], [0, 0]]) }, 'mainnet').sentence).toBe('No graded verdicts on mainnet yet.');
  });
  test('bands under five verdicts are too few to judge', () => {
    expect(MIN_BAND_VERDICTS).toBe(5);
    expect(verdictCount(1)).toBe('1 verdict');
    expect(verdictCount(3)).toBe('3 verdicts');
  });
});
