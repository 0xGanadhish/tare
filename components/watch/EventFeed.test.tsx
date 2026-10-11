// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NETWORKS } from '@/shared/networks';
import type { FeedEvent } from './feed';

vi.mock('./PositionCard', () => ({ ExitButton: () => null }));

import { EventFeed } from './EventFeed';

const vault = '0x2222222222222222222222222222222222222222';
const hash = `0x${'ab'.repeat(32)}`;
const base: FeedEvent = { id: '1', at: '2026-10-11T10:00:00Z', vault, type: 'exit_confirmed', message: 'Exit confirmed in 0.8 s', txHash: hash, confidence: null };

afterEach(cleanup);

describe('EventFeed', () => {
  test('EventFeed renders "Partly out" with the locked amount for a partial exit event', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, type: 'exit_partial', message: '120.5 USDC still locked' }]} positions={[]} />);
    expect(screen.getByText(/Partly out · 120.5 USDC still locked/)).toBeTruthy();
    expect(screen.queryByText(/You.re out/)).toBeNull();
  });

  test('a v1 partial exit message also reads as Partly out', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, message: 'Exit confirmed · partial: 40 USDC still locked' }]} positions={[]} />);
    expect(screen.getByText(/Partly out · 40 USDC still locked/)).toBeTruthy();
  });

  test('a full exit reads You are out', () => {
    render(<EventFeed network="testnet" connected events={[base]} positions={[]} />);
    expect(screen.getByText(/You.re out/)).toBeTruthy();
  });

  test('EventFeed links tx hashes to the selected network\'s explorer', () => {
    const { unmount } = render(<EventFeed network="mainnet" connected events={[base]} positions={[]} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(`${NETWORKS.mainnet.explorer}/tx/${hash}`);
    unmount();
    render(<EventFeed network="testnet" connected events={[base]} positions={[]} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(`${NETWORKS.testnet.explorer}/tx/${hash}`);
  });
});

describe('exit errors', () => {
  test('VerdictAlreadyUsed reads as already exited on this verdict', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, type: 'exit_failed', txHash: null, message: 'reverted: VerdictAlreadyUsed()' }]} positions={[]} />);
    expect(screen.getByRole('alert').textContent).toMatch(/already used/);
  });
});

describe('backend wording', () => {
  test('backend partial message is not doubled', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, type: 'exit_partial', message: 'Partly out: 12 USDC still locked' }]} positions={[]} />);
    expect(screen.getByText(/Partly out · 12 USDC still locked/)).toBeTruthy();
    expect(screen.queryByText(/Partly out · Partly out/)).toBeNull();
  });
  test('jev_unavailable gets a plain title', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, type: 'jev_unavailable', txHash: null, message: 'Jev did not answer' }]} positions={[]} />);
    expect(screen.getByText('Jev unavailable')).toBeTruthy();
  });
});

describe('verdict floor wording', () => {
  test('VerdictAlreadyUsed explains both causes', () => {
    render(<EventFeed network="testnet" connected events={[{ ...base, type: 'exit_failed', txHash: null, message: 'VerdictAlreadyUsed()' }]} positions={[]} />);
    expect(screen.getByRole('alert').textContent).toMatch(/rule changed after it/);
  });
});

test('jev_unavailable is shown as a warning', () => {
  render(<EventFeed network="testnet" connected events={[{ ...base, type: 'jev_unavailable', txHash: null, message: 'Jev is unreachable, so no verdict can be posted and Guardian cannot exit for you' }]} positions={[]} />);
  expect(screen.getByRole('status').textContent).toMatch(/Guardian cannot exit for you/);
});
