import { createConfig, http, injected } from 'wagmi';
import { monadTestnet } from '@/shared/chains';

/** Injected wallets only (MetaMask, Rabby, Phantom EVM…); every user transaction goes to Monad testnet. */
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http() },
  ssr: true,
});
