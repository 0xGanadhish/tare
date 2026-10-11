'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { NETWORKS, type Network, type NetworkConfig } from '@/shared/networks';
import { NETWORK_PARAM, NETWORK_STORAGE_KEY, resolveNetwork } from './resolve';

export interface NetworkContextValue {
  network: Network;
  config: NetworkConfig;
  setNetwork(n: Network): void;
  /** False only when a wallet is connected on a chain other than the selected network. */
  walletOnRightChain: boolean;
  switchWalletChain(): Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(NETWORK_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Selected network (spec §8.1). Server render and first paint use testnet; the URL and storage are read after mount. */
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setState] = useState<Network>('testnet');
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get(NETWORK_PARAM);
    setState(resolveNetwork(param, readStored()));
  }, []);

  const setNetwork = useCallback((n: Network) => {
    setState(n);
    try {
      window.localStorage.setItem(NETWORK_STORAGE_KEY, n);
    } catch {
      // Storage blocked (private mode): the URL param still carries the choice.
    }
    const url = new URL(window.location.href);
    url.searchParams.set(NETWORK_PARAM, n);
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const config = NETWORKS[network];
  const walletOnRightChain = !isConnected || chainId === config.chain.id;
  const switchWalletChain = useCallback(async () => {
    await switchChainAsync({ chainId: config.chain.id });
  }, [switchChainAsync, config.chain.id]);

  const value = useMemo(
    () => ({ network, config, setNetwork, walletOnRightChain, switchWalletChain }),
    [network, config, setNetwork, walletOnRightChain, switchWalletChain],
  );
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}

/** "Monad Testnet" / "Monad Mainnet", as used on switch prompts. */
export const networkLabel = (n: Network): string => (n === 'mainnet' ? 'Monad Mainnet' : 'Monad Testnet');
