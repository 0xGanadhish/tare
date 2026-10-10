'use client';

import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { addresses, abis } from '@/shared/contracts';
import { monadTestnet } from '@/shared/chains';
import { TxButton } from '@/components/tx/TxButton';

const MINT_AMOUNT = 1_000_000_000n; // 1,000 USDC (6 decimals)

/** Test-USDC balance of the connected wallet (re-read from chain; refreshed after every confirmed tx). */
export function useUsdcBalance() {
  const { address } = useAccount();
  const token = addresses.mockUsdc;
  return useReadContract({
    address: token,
    abi: abis.mockToken,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(token && address) },
  });
}

/** "Get test USDC": mints 1,000 MockUSDC to the connected wallet. Hidden until the token is deployed. */
export function FaucetButton() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useUsdcBalance();
  const token = addresses.mockUsdc;
  if (!token) return null;

  return (
    <div className="flex items-center gap-3">
      {address && balance !== undefined && (
        <span className="mono hidden text-[11.5px] text-secondary sm:inline" title="Test USDC balance">
          {Number(formatUnits(balance, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
        </span>
      )}
      <TxButton
        popover
        size="sm"
        variant="secondary"
        label="Get test USDC"
        run={() =>
          writeContractAsync({
            address: token,
            abi: abis.mockToken,
            functionName: 'mint',
            args: [address!, MINT_AMOUNT],
            chainId: monadTestnet.id,
          })
        }
      />
    </div>
  );
}
