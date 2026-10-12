// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Pool, Verdict } from '@/shared/types';
import { VerdictSlip } from './VerdictSlip';

afterEach(cleanup);

const pool = {
  id: '6e69bba9-5a90-5712-8f5e-2012b57f5daf', project: 'accountable', symbol: 'AUSD', assetClass: 'stable', tvlUsd: 30_769_129,
  apy: 7.14, realApy: 6.74415, incentiveShare: 0.06, maturity: null, meta: null,
} as Pool;
const verdict: Verdict = {
  poolId: pool.id, label: 'CONSIDER', confidence: 0.55, risk: 1.98, yieldSource: 'organic', band: 'low', statsHash: 'h', judgedAt: '2026-10-12',
  flags: [
    { key: 'yield_source', text: 'Yield source: organic', confidence: 0.59 },
    { key: 'sustainable', text: 'Chance this APY lasts the next 30 days: 45%' },
    { key: 'risk', text: 'Risk: 1.98/5', confidence: 0.55 },
  ],
};

describe('VerdictSlip', () => {
  test('shows one confidence figure, as a plain "Confidence" row', () => {
    const { container } = render(<VerdictSlip pool={pool} verdict={verdict} />);
    expect(screen.getByText('Confidence')).toBeTruthy();
    expect(screen.getByText('55%')).toBeTruthy();
    expect(container.textContent).not.toMatch(/sure|Jev is/);
    expect(screen.getByText('Risk 2 out of 5, where 1 is safest.')).toBeTruthy();
  });

  test('tells same-named pools apart under the name', () => {
    const { unmount } = render(<VerdictSlip pool={{ ...pool, meta: 'Earn ACC Points' }} verdict={verdict} />);
    expect(screen.getByText('Earn ACC Points')).toBeTruthy();
    unmount();
    render(<VerdictSlip pool={pool} verdict={verdict} />);
    expect(screen.getByText('$30.8M pool')).toBeTruthy();
  });

  test('an unjudged pool names Tare, not Jev', () => {
    const { container } = render(<VerdictSlip pool={pool} />);
    expect(container.textContent).not.toMatch(/Jev/);
    expect(container.textContent).toMatch(/Not judged yet/);
  });
});
