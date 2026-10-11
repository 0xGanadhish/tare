import { describe, expect, test } from 'vitest';
import { decodeReasons, outcomeOf, verdictLabel } from './format';

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
