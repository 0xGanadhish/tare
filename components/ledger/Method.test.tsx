// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Method } from './Method';
import { RESOLVE_WINDOW, SAMPLE_WINDOW } from '@/components/docs/articles';

afterEach(cleanup);

test('Ledger method describes worst-sample grading on mainnet, not a single reading', () => {
  render(<Method />);
  const text = document.body.textContent ?? '';
  expect(text).toContain(`${RESOLVE_WINDOW.testnet} on testnet`);
  expect(text).toContain(`${RESOLVE_WINDOW.mainnet} on mainnet`);
  expect(text).toContain(`${SAMPLE_WINDOW.mainnet}`);
  expect(text).toMatch(/worst/i);
  expect(text).toContain('sample');
  expect(text).not.toMatch(/point-in-time/);
});
