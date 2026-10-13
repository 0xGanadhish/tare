// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORKS, type Network } from '@/shared/networks';

const me = '0x52b1000000000000000000000000000000Af3f00' as const;
const net = vi.hoisted(() => ({ network: 'testnet' as Network }));
const calls = vi.hoisted(() => ({ disconnect: vi.fn(), reads: [] as { functionName: string; query?: { enabled?: boolean } }[] }));

vi.mock('wagmi', () => ({
  useBalance: () => ({ data: { value: 2_500_000_000_000_000_000n, decimals: 18 } }),
  useDisconnect: () => ({ disconnect: calls.disconnect }),
  useReadContract: (args: { functionName: string; query?: { enabled?: boolean } }) => {
    calls.reads.push(args);
    if (args.functionName === 'balanceOf') return { data: 1_234_560_000n };
    if (args.functionName === 'launches' && args.query?.enabled !== false) {
      return {
        data: [
          { token: '0x00000000000000000000000000000000000000c1', creator: me, reserveVault: '0x00000000000000000000000000000000000000d1', name: 'Pune Coin', symbol: 'PUNE' },
          { token: '0x00000000000000000000000000000000000000c2', creator: '0x00000000000000000000000000000000000000ee', reserveVault: '0x00000000000000000000000000000000000000d1', name: 'Not Mine', symbol: 'NOPE' },
        ],
      };
    }
    return { data: undefined };
  },
  useReadContracts: ({ contracts }: { contracts: unknown[] }) => ({
    data: contracts.map((_, i) => ({ status: 'success', result: i === 0 ? [true, 9000, 600, 1n] : [false, 0, 0, 0n] })),
  }),
}));

vi.mock('@/components/network/NetworkProvider', async (orig) => ({
  ...await orig<typeof import('@/components/network/NetworkProvider')>(),
  useNetwork: () => {
    const config = NETWORKS[net.network];
    return { network: net.network, config, setNetwork: vi.fn(), walletOnRightChain: true, switchWalletChain: vi.fn() };
  },
}));

import { WalletPane } from './WalletPane';

function stubFetch() {
  const vault = NETWORKS[net.network].vaults[0];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/positions/')) {
      return Response.json({
        positions: [{ vault, shares: '1000000', assets: '42500000', redeemable: '1000000', rule: null, latest: null }],
      });
    }
    if (url.startsWith('/api/watch/events')) {
      return Response.json({
        events: [{ id: 'e1', at: '2026-10-13T10:00:00Z', vault: vault.address, type: 'exit_confirmed', message: 'Out in 0.8 s', txHash: '0xabc0000000000000000000000000000000000000000000000000000000000def', confidence: null }],
      });
    }
    return new Response(null, { status: 404 });
  }));
}

function renderPane(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <button>outside</button>
      <WalletPane address={me} open onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  net.network = 'testnet';
  calls.reads = [];
  calls.disconnect.mockReset();
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WalletPane', () => {
  test('is a labelled modal dialog that moves focus inside', () => {
    renderPane();
    const dialog = screen.getByRole('dialog', { name: 'Wallet' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('renders nothing while closed', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WalletPane address={me} open={false} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('shows MON and test USDC balances on testnet', () => {
    renderPane();
    const balances = screen.getByRole('region', { name: 'Balances' });
    expect(within(balances).getByText('MON')).toBeTruthy();
    expect(within(balances).getByText('2.5')).toBeTruthy();
    expect(within(balances).getByText('test USDC')).toBeTruthy();
    expect(within(balances).getByText('1,234.56')).toBeTruthy();
  });

  test('calls mainnet USDC plain "USDC"', () => {
    net.network = 'mainnet';
    renderPane();
    const balances = screen.getByRole('region', { name: 'Balances' });
    expect(within(balances).getByText('USDC')).toBeTruthy();
    expect(within(balances).queryByText('test USDC')).toBeNull();
  });

  test('lists positions from the positions API for the selected network', async () => {
    renderPane();
    const section = screen.getByRole('region', { name: 'Positions' });
    expect(await within(section).findByText('42.5')).toBeTruthy();
    expect(within(section).getByText(NETWORKS.testnet.vaults[0].name)).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/positions/${me}?network=testnet`);
  });

  test('lists active Guardian rules with links to Watch', () => {
    renderPane();
    const section = screen.getByRole('region', { name: 'Guardian rules' });
    const link = within(section).getByRole('link', { name: new RegExp(NETWORKS.testnet.vaults[0].name) });
    expect(link.getAttribute('href')).toBe('/app/watch?network=testnet');
    expect(link.textContent).toMatch(/≥90%/);
    expect(link.textContent).toMatch(/10 min/);
  });

  test('shows Tare activity and a MonadVision link for the address', async () => {
    renderPane();
    const section = screen.getByRole('region', { name: 'Tare activity' });
    expect(await within(section).findByText('Exit confirmed')).toBeTruthy();
    const all = within(section).getByRole('link', { name: /View all on MonadVision/ });
    expect(all.getAttribute('href')).toBe(`${NETWORKS.testnet.explorer}/address/${me}`);
  });

  test('shows only tokens this wallet launched, on testnet', () => {
    renderPane();
    const section = screen.getByRole('region', { name: 'Launched tokens' });
    expect(within(section).getByText('Pune Coin')).toBeTruthy();
    expect(within(section).queryByText('Not Mine')).toBeNull();
  });

  test('never shows or reads launched tokens on mainnet', () => {
    net.network = 'mainnet';
    renderPane();
    expect(screen.queryByRole('region', { name: 'Launched tokens' })).toBeNull();
    expect(screen.queryByText('Pune Coin')).toBeNull();
    expect(calls.reads.some((r) => r.functionName === 'launches')).toBe(false);
  });

  test('Escape and the backdrop close it', () => {
    const onClose = renderPane();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('wallet-pane-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('the close button closes it', () => {
    const onClose = renderPane();
    fireEvent.click(screen.getByRole('button', { name: 'Close wallet' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Tab from the last control wraps to the first (focus trap)', () => {
    renderPane();
    const dialog = screen.getByRole('dialog', { name: 'Wallet' });
    const focusable = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
    focusable[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  test('copies the address and disconnects', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onClose = renderPane();
    fireEvent.click(screen.getByRole('button', { name: /Copy address/ }));
    expect(writeText).toHaveBeenCalledWith(me);
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(calls.disconnect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
