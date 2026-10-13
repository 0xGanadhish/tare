// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORKS } from '@/shared/networks';

const me = '0x52b1000000000000000000000000000000Af3f00';

vi.mock('wagmi', () => ({
  injected: () => ({}),
  useAccount: () => ({ address: me, isConnected: true, isConnecting: false, chainId: NETWORKS.testnet.chain.id }),
  useConnect: () => ({ connect: vi.fn() }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
  useBalance: () => ({ data: undefined }),
  useReadContract: () => ({ data: undefined }),
  useReadContracts: () => ({ data: undefined }),
}));
vi.mock('@/components/network/NetworkProvider', async (orig) => ({
  ...await orig<typeof import('@/components/network/NetworkProvider')>(),
  useNetwork: () => ({ network: 'testnet', config: NETWORKS.testnet, setNetwork: vi.fn(), walletOnRightChain: true, switchWalletChain: vi.fn() }),
}));
vi.stubGlobal('fetch', vi.fn(async () => Response.json({ positions: [], events: [] })));

import { WalletButton } from './WalletButton';

afterEach(cleanup);

test('the connected address button opens the wallet pane and Escape closes it', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WalletButton />
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole('button', { name: /0x52b1…3f00/ });
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Wallet' })).toBeTruthy();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('the pane renders outside the header (backdrop-blur would clip a fixed child to the header)', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <header data-testid="hdr" className="backdrop-blur">
        <WalletButton />
      </header>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /0x52b1…3f00/ }));
  expect(screen.getByTestId('hdr').contains(screen.getByRole('dialog', { name: 'Wallet' }))).toBe(false);
});
