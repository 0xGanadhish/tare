import { createConfig, http, injected } from 'wagmi';
import { monadMainnet, monadTestnet } from '@/shared/chains';

/** Injected wallets only (MetaMask, Rabby, Phantom EVM…). Each tx names the selected network's chain (useNetwork). */
export const wagmiConfig = createConfig({
  chains: [monadTestnet, monadMainnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http(), [monadMainnet.id]: http() },
  ssr: true,
});
