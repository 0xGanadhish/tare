import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { abis, addresses } from '../shared/contracts';
import { monadTestnet } from '../shared/chains';
import type { Address, VaultStats } from '../shared/types';

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

// Monad charges gas_limit × price, so keeper txs use the estimate plus a small margin, not a blanket cap.
const GAS_MARGIN_NUM = 12n;
const GAS_MARGIN_DEN = 10n;

function wallet() {
  const pk = process.env.OPERATOR_PRIVATE_KEY;
  if (!pk) throw new Error('OPERATOR_PRIVATE_KEY is not set');
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex);
  return { account, client: createWalletClient({ account, chain: monadTestnet, transport: http() }) };
}

async function send(
  address: Address,
  abi: typeof abis.mirrorVault | typeof abis.guardian,
  functionName: string,
  args: readonly unknown[],
) {
  const { account, client } = wallet();
  const started = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = { address, abi, functionName, args, account } as any;
  const estimate = await publicClient.estimateContractGas(call); // reverts (e.g. NothingToExit) surface here
  const txHash = await client.writeContract({ ...call, gas: (estimate * GAS_MARGIN_NUM) / GAS_MARGIN_DEN });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`Transaction ${txHash} reverted`);
  return { txHash, block: receipt.blockNumber, seconds: (Date.now() - started) / 1000 };
}

export async function sendSetStats(vault: Address, stats: VaultStats) {
  return send(vault, abis.mirrorVault, 'setStats', [stats.apyBps, stats.utilBps]);
}

export async function sendExit(vault: Address, owner: Address) {
  const guardian = addresses.guardian;
  if (!guardian) throw new Error('Guardian address missing');
  const balanceBefore = await publicClient.readContract({ address: (await assetOf(vault)), abi: abis.mockToken, functionName: 'balanceOf', args: [owner] });
  const r = await send(guardian, abis.guardian, 'exit', [vault, owner]);
  const balanceAfter = await publicClient.readContract({ address: (await assetOf(vault)), abi: abis.mockToken, functionName: 'balanceOf', args: [owner], blockNumber: r.block });
  // Withdrawals are capped by vault liquidity, so an exit can be partial: report what is still in.
  const sharesLeft = await publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'balanceOf', args: [owner], blockNumber: r.block });
  const remaining = sharesLeft === 0n ? 0n : await publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'convertToAssets', args: [sharesLeft], blockNumber: r.block });
  return { ...r, assets: balanceAfter - balanceBefore, remaining };
}

async function assetOf(vault: Address): Promise<Address> {
  return publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'asset' });
}
