import { describe, expect, test } from 'vitest';
import { colorForVerdict, jitter, radiusForTvl, scanProgress, xForApy, yForTvl } from './scales';

describe('xForApy', () => {
  test('caps at 30% so a 45% pool sits on the right edge', () => {
    expect(xForApy(45, 800)).toBe(xForApy(30, 800));
  });
  test('grows with apy and never leaves the plot', () => {
    expect(xForApy(10, 800)).toBeGreaterThan(xForApy(5, 800));
    expect(xForApy(-3, 800)).toBe(xForApy(0, 800));
    expect(xForApy(30, 800)).toBeLessThanOrEqual(800);
    expect(xForApy(0, 800)).toBeGreaterThanOrEqual(0);
  });
});

describe('yForTvl', () => {
  test('larger TVL sits higher (smaller y)', () => {
    expect(yForTvl(1e8)).toBeLessThan(yForTvl(1e6));
  });
  test('clamps to the 1e5–2e8 range inside the height', () => {
    expect(yForTvl(1e3, 330)).toBe(yForTvl(1e5, 330));
    expect(yForTvl(1e12, 330)).toBe(yForTvl(2e8, 330));
    expect(yForTvl(1e5, 330)).toBeLessThanOrEqual(330);
    expect(yForTvl(2e8, 330)).toBeGreaterThanOrEqual(0);
  });
  test('never NaN for zero or garbage TVL', () => {
    expect(Number.isFinite(yForTvl(0))).toBe(true);
    expect(Number.isFinite(yForTvl(Number.NaN))).toBe(true);
  });
});

describe('radiusForTvl', () => {
  test('grows with TVL, bounded', () => {
    expect(radiusForTvl(1e8)).toBeGreaterThan(radiusForTvl(1e6));
    expect(radiusForTvl(1)).toBe(radiusForTvl(1e5));
    expect(radiusForTvl(1e12)).toBe(radiusForTvl(2e8));
  });
});

describe('colorForVerdict', () => {
  test('palette from the spec', () => {
    expect(colorForVerdict('DEPOSIT').fill).toBe('#6E54F5');
    expect(colorForVerdict('AVOID').fill).toBe('#E2552C');
    expect(colorForVerdict('CONSIDER')).toEqual({ fill: null, stroke: '#B9B6C3' });
    expect(colorForVerdict('NOT_JUDGED')).toEqual({ fill: null, stroke: '#E6E4DE' });
  });
});

describe('scanProgress', () => {
  test('holds at 0 until the sweep starts at 700ms', () => {
    expect(scanProgress(0)).toBe(0);
    expect(scanProgress(700)).toBe(0);
  });
  test('ends at 1 after 1400ms of sweep', () => {
    expect(scanProgress(2100)).toBe(1);
    expect(scanProgress(5000)).toBe(1);
  });
  test('eases out cubic: fast start, passes 0.5 before the midpoint', () => {
    expect(scanProgress(1400)).toBeCloseTo(0.875, 5);
    expect(scanProgress(1400)).toBeGreaterThan(0.5);
  });
});

describe('jitter', () => {
  test('is deterministic and small', () => {
    expect(jitter(7)).toBe(jitter(7));
    for (let i = 0; i < 200; i++) expect(Math.abs(jitter(i))).toBeLessThanOrEqual(3);
  });
});
