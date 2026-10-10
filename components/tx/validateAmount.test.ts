import { describe, expect, test } from 'vitest';
import { validateAmount } from './validateAmount';

const BAL = 1_000_000_000n; // 1000 USDC at 6 decimals

describe('validateAmount', () => {
  test.each([
    ['', 'Enter an amount'],
    ['   ', 'Enter an amount'],
    ['0', 'Enter an amount'],
    ['0.000000', 'Enter an amount'],
    ['1.1234567', 'Too many decimals'],
    ['2000', 'Insufficient balance'],
    ['abc', 'Enter a valid amount'],
    ['-5', 'Enter a valid amount'],
    ['1e3', 'Enter a valid amount'],
  ])('validateAmount(%s) → %s', (input, error) => {
    expect(validateAmount(input, BAL, 6)).toEqual({ ok: false, error });
  });

  test.each([
    ['500', 500_000_000n],
    ['1000', 1_000_000_000n],
    ['0.5', 500_000n],
    ['.5', 500_000n],
    ['1.', 1_000_000n],
  ])('accepts %s', (input, value) => {
    expect(validateAmount(input, 2_000_000_000n, 6)).toEqual({ ok: true, value });
  });

  test('ignores thousands separators', () => {
    expect(validateAmount('1,250.5', 2_000_000_000n, 6)).toEqual({ ok: true, value: 1_250_500_000n });
  });

  test('works for 18 decimals', () => {
    expect(validateAmount('1.5', 2n * 10n ** 18n, 18)).toEqual({ ok: true, value: 15n * 10n ** 17n });
  });
});
