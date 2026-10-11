// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORKS, type Network, type VaultConfig } from '@/shared/networks';

const wallet = vi.hoisted(() => ({ chainId: 10143 as number, address: '0x00000000000000000000000000000000000000a1' as `0x${string}` }));
const net = vi.hoisted(() => ({ network: 'testnet' as Network }));

vi.mock('wagmi', () => ({
  injected: () => ({}),
  useAccount: () => ({ address: wallet.address, isConnected: true, chainId: wallet.chainId }),
  useConnect: () => ({ connect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), switchChainAsync: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
  useConfig: () => ({}),
  useReadContract: ({ functionName }: { functionName: string }) => ({ data: functionName === 'allowance' ? 0n : 5_000_000_000n }),
  useReadContracts: () => ({ data: [] }),
}));

vi.mock('@/components/network/NetworkProvider', async (orig) => {
  const actual = await orig<typeof import('@/components/network/NetworkProvider')>();
  return {
    ...actual,
    useNetwork: () => {
      const config = NETWORKS[net.network];
      return { network: net.network, config, setNetwork: vi.fn(), walletOnRightChain: wallet.chainId === config.chain.id, switchWalletChain: vi.fn() };
    },
  };
});

import { DepositFlow } from './DepositFlow';

const vault: VaultConfig = { address: '0x00000000000000000000000000000000000000b2', name: 'Test vault', poolId: 'pool-1', protocol: 'euler', adapter: null };

function renderFlow() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DepositFlow vault={vault} defaultAmount={100} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

describe('DepositFlow', () => {
  test('DepositFlow blocks when wallet chain != selected network', () => {
    net.network = 'mainnet';
    wallet.chainId = NETWORKS.testnet.chain.id;
    window.localStorage.setItem(`tare.mainnet-ack.${wallet.address}`, '1');
    renderFlow();
    expect(screen.getByRole('button', { name: 'Switch to Monad Mainnet' })).toBeTruthy();
    for (const name of [/Approve/, /Deposit/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  test('mainnet first deposit shows the real-funds confirmation', () => {
    net.network = 'mainnet';
    wallet.chainId = NETWORKS.mainnet.chain.id;
    renderFlow();
    expect(screen.getByText(/real USDC/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /I understand/ }));
    expect(screen.getByRole('button', { name: /Approve/ })).toBeTruthy();
  });

  test('the confirmation is remembered per wallet', () => {
    net.network = 'mainnet';
    wallet.chainId = NETWORKS.mainnet.chain.id;
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: /I understand/ }));
    cleanup();
    renderFlow();
    expect(screen.queryByRole('button', { name: /I understand/ })).toBeNull();
  });

  test('testnet skips the confirmation and enables the steps on the right chain', () => {
    net.network = 'testnet';
    wallet.chainId = NETWORKS.testnet.chain.id;
    renderFlow();
    expect(screen.queryByRole('button', { name: /I understand/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch to/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Approve/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
