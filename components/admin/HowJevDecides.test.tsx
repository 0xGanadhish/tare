// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HowJevDecides } from './HowJevDecides';

afterEach(cleanup);

test('HowJevDecides: describes the v2 flow (watcher cadence, onchain verdict, the user’s own Guardian rule)', () => {
  const text = render(<HowJevDecides />).container.textContent ?? '';
  expect(text).toContain('every 15 seconds');
  expect(text).toContain('posted onchain');
  expect(text).toContain('your Guardian rule');
  expect(text).toContain('anyone can trigger');
  expect(text).not.toMatch(/autopilot|within about a second|90% sure/i);
});
