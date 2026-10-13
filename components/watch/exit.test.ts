import { expect, test } from 'vitest';
import { exitPlan } from './exit';

test('exits everything when nothing is locked', () => {
  expect(exitPlan(5n, 5n)).toEqual({ shares: 5n, locked: 0n });
});
test('a partly locked vault redeems only what it allows', () => {
  expect(exitPlan(5n, 3n)).toEqual({ shares: 3n, locked: 2n });
});
test('maxRedeem above the balance never redeems more than the balance', () => {
  expect(exitPlan(5n, 9n)).toEqual({ shares: 5n, locked: 0n });
});
