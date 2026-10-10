import { expect, test } from 'vitest';
import { band, combineVerdict } from './combine';

const verdict = (value: 'organic' | 'incentive' | 'mixed', sustainable: number, score: number) => combineVerdict({
  yieldSource: { value, confidence: 0.91 }, sustainable, risk: { score, confidence: 0.84 },
});
test('incentive yield that will not persist is AVOID', () => expect(verdict('incentive', 0.21, 3).label).toBe('AVOID'));
test('risk 4 is AVOID regardless of source; only deciding risk confidence is used', () => {
  const result = combineVerdict({ yieldSource: { value: 'organic', confidence: 0.4 }, sustainable: 0.9, risk: { score: 4, confidence: 0.9 } });
  expect(result.label).toBe('AVOID');
  expect(result.confidence).toBe(0.9);
});
test('organic sustainable low-risk yield is DEPOSIT; noul is not confidence', () => {
  expect(verdict('organic', 0.7, 2)).toMatchObject({ label: 'DEPOSIT', confidence: 0.84, band: 'high', risk: 2 });
});
test('mixed source can be DEPOSIT', () => expect(verdict('mixed', 0.7, 2).label).toBe('DEPOSIT'));
test('organic but sustainable 0.5 is CONSIDER', () => expect(verdict('organic', 0.5, 2).label).toBe('CONSIDER'));
test('thresholds are inclusive except incentive sustainability < 0.4', () => {
  expect(verdict('incentive', 0.4, 3).label).toBe('CONSIDER');
  expect(verdict('mixed', 0.6, 2).label).toBe('DEPOSIT');
  expect(verdict('organic', 1, 3).label).toBe('CONSIDER');
});
test('confidence bands', () => {
  expect(band(0.8)).toBe('high'); expect(band(0.6)).toBe('medium'); expect(band(0.59)).toBe('low');
});
