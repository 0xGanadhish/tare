// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORKS } from '@/shared/networks';

vi.mock('wagmi', () => ({
  injected: () => ({}),
  useAccount: () => ({ address: '0x00000000000000000000000000000000000000a1', isConnected: true, chainId: 10143 }),
  useConnect: () => ({ connect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
  useConfig: () => ({}),
  useReadContract: ({ functionName }: { functionName: string }) => ({ data: functionName === 'approvedVault' ? true : 0n }),
}));
vi.mock('@/components/network/NetworkProvider', async (orig) => ({
  ...await orig<typeof import('@/components/network/NetworkProvider')>(),
  useNetwork: () => ({ network: 'testnet', config: { ...NETWORKS.testnet, guardian: '0x3333333333333333333333333333333333333333' }, setNetwork: vi.fn(), walletOnRightChain: true, switchWalletChain: vi.fn() }),
}));
import { ProtectStep } from './ProtectStep';

afterEach(cleanup);
const vault = '0x2222222222222222222222222222222222222222';
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

test('warns that (re)enabling skips a live EXIT verdict', () => {
  wrap(<ProtectStep vault={vault} onDone={() => {}} liveExit />);
  expect(screen.getByRole('note').textContent).toMatch(/current EXIT verdict/);
});
test('no warning without a live EXIT', () => {
  wrap(<ProtectStep vault={vault} onDone={() => {}} />);
  expect(screen.queryByRole('note')).toBeNull();
});
