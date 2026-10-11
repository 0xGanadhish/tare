import { describe, expect, test } from 'vitest';
import { scoreLedger, type ScoreRow } from './score';

const row = (over: Partial<ScoreRow> = {}): ScoreRow => ({ verdict: 'HOLD', confidenceBps: 9000, riskBps: 1000, resolved: true, adverse: false, ...over });
const band = (s: ReturnType<typeof scoreLedger>, b: string) => s.bands.find((x) => x.band === b)!;

describe('scoreLedger', () => {
  test('scoreLedger ignores unresolved rows', () => {
    const s = scoreLedger([row(), row({ resolved: false, adverse: null }), row({ resolved: false, adverse: null, riskBps: 9999 })]);
    expect(s.n).toBe(1);
    expect(s.brier).toBeCloseTo(0.01, 10);
  });

  test('empty ledger has no Brier score and is early', () => {
    expect(scoreLedger([])).toEqual({
      n: 0, brier: null, early: true,
      bands: [
        { band: '<80', n: 0, hitRate: null }, { band: '80-89', n: 0, hitRate: null },
        { band: '90-94', n: 0, hitRate: null }, { band: '95-100', n: 0, hitRate: null },
      ],
    });
  });

  test('brier of perfect forecasts is 0', () => {
    expect(scoreLedger([row({ riskBps: 0, adverse: false }), row({ verdict: 'EXIT', riskBps: 10000, adverse: true })]).brier).toBe(0);
  });

  test('brier is the mean squared error of riskBps vs adverse', () => {
    // (0.2-0)^2 = 0.04, (0.7-1)^2 = 0.09 → mean 0.065
    expect(scoreLedger([row({ riskBps: 2000 }), row({ riskBps: 7000, adverse: true })]).brier).toBeCloseTo(0.065, 10);
  });

  test('EXIT+adverse counts as a hit, HOLD+adverse as a miss', () => {
    const s = scoreLedger([row({ verdict: 'EXIT', adverse: true }), row({ verdict: 'HOLD', adverse: true })]);
    expect(band(s, '90-94')).toEqual({ band: '90-94', n: 2, hitRate: 0.5 });
  });

  test('HOLD and MOVE without adverse are hits; EXIT without adverse is a miss', () => {
    const s = scoreLedger([row({ verdict: 'HOLD' }), row({ verdict: 'MOVE' }), row({ verdict: 'EXIT' })]);
    expect(band(s, '90-94').hitRate).toBeCloseTo(2 / 3, 10);
  });

  test('n=12 → early true; n=30 → early false', () => {
    expect(scoreLedger(Array.from({ length: 12 }, () => row())).early).toBe(true);
    expect(scoreLedger(Array.from({ length: 30 }, () => row())).early).toBe(false);
  });

  test('band boundaries 8999→80-89, 9000→90-94, 9500→95-100', () => {
    const s = scoreLedger([row({ confidenceBps: 7999 }), row({ confidenceBps: 8000 }), row({ confidenceBps: 8999 }), row({ confidenceBps: 9000 }), row({ confidenceBps: 9499 }), row({ confidenceBps: 9500 }), row({ confidenceBps: 10000 })]);
    expect(s.bands.map((b) => [b.band, b.n])).toEqual([['<80', 1], ['80-89', 2], ['90-94', 2], ['95-100', 2]]);
  });
});
