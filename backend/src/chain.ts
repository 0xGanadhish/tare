import { createPublicClient, http, type Address, type Chain, type Hex, type Log } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface UnsignedTx { to: Address; data: Hex; nonce: number; gas: bigint }
export interface Receipt { status: 'success' | 'reverted'; blockNumber: bigint; gasUsed: bigint; logs: Pick<Log, 'address' | 'topics' | 'data'>[] }

/** Everything the backend needs from one key on one chain; tests swap in a fake. */
export interface ChainClient {
  address: Address;
  estimateGas(tx: { to: Address; data: Hex }): Promise<bigint>;
  getTransactionCount(): Promise<number>;
  signTransaction(tx: UnsignedTx): Promise<Hex>;
  sendRawTransaction(raw: Hex): Promise<Hex>;
  /** Whether the node has seen this tx (pending or mined). */
  isKnown(hash: Hex): Promise<boolean>;
  waitForReceipt(hash: Hex): Promise<Receipt>;
}

export function viemChainClient(chain: Chain, rpcUrl: string, privateKey: Hex): ChainClient {
  const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 3 }) });
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    estimateGas: (tx) => client.estimateGas({ account: account.address, to: tx.to, data: tx.data }),
    getTransactionCount: () => client.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    async signTransaction(tx) {
      const fees = await client.estimateFeesPerGas();
      return account.signTransaction({
        chainId: chain.id, type: 'eip1559', to: tx.to, data: tx.data, nonce: tx.nonce, gas: tx.gas,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
    },
    sendRawTransaction: (raw) => client.sendRawTransaction({ serializedTransaction: raw }),
    isKnown: (hash) => client.getTransaction({ hash }).then(() => true, () => false),
    async waitForReceipt(hash) {
      const r = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      return { status: r.status, blockNumber: r.blockNumber, gasUsed: r.gasUsed, logs: r.logs };
    },
  };
}
