// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LedgerScore } from '@/shared/score';
import { Scoreboard } from './Scoreboard';

afterEach(cleanup);

// Live testnet numbers on 2026-10-12.
const live: LedgerScore = {
  n: 15, brier: 0.34882666666666673, early: true,
  bands: [
    { band: '<80', n: 3, hitRate: 1 },
    { band: '80-89', n: 5, hitRate: 0.6 },
    { band: '90-94', n: 1, hitRate: 0 },
    { band: '95-100', n: 6, hitRate: 4 / 6 },
  ],
};

describe('Scoreboard', () => {
  test('leads with a plain sentence and plain labels', () => {
    const { container } = render(<Scoreboard score={live} network="testnet" />);
    expect(screen.getByText('Jev was right 10 of 15 times.')).toBeTruthy();
    expect(screen.getByText('Graded')).toBeTruthy();
    expect(screen.getByText('Right')).toBeTruthy();
    expect(screen.getByText('Early data')).toBeTruthy();
    expect(screen.getByText('6 verdicts')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/n=|Hit rate|Resolved|coin flip/);
  });

  test('greys out bands with fewer than five verdicts', () => {
    render(<Scoreboard score={live} network="testnet" />);
    expect(screen.getAllByText('too few to judge')).toHaveLength(2);
    expect(screen.getByText('3 verdicts').closest('[data-thin]')).toBeTruthy();
    expect(screen.getByText('5 verdicts').closest('[data-thin]')).toBeNull();
  });

  test('keeps the Brier score inside a "How we score this" disclosure', () => {
    render(<Scoreboard score={live} network="testnet" />);
    const summary = screen.getByText('How we score this');
    expect(summary.closest('details')?.textContent).toMatch(/Brier score 0\.349/);
  });

  test('notes the demo stress tests on testnet only', () => {
    const { unmount } = render(<Scoreboard score={live} network="testnet" />);
    expect(screen.getByRole('note').textContent).toMatch(/demo stress tests.*real track record is on mainnet/);
    unmount();
    render(<Scoreboard score={live} network="mainnet" />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
