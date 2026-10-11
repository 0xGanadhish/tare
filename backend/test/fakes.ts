import type { Address, Hex } from 'viem';
import type { ChainClient, Receipt, UnsignedTx } from '../src/chain';

/** In-memory chain: assigns hashes, checks nonces like a node would, and returns scripted receipts. */
export class FakeChain implements ChainClient {
  address: Address = '0x00000000000000000000000000000000000000e1';
  chainNonce = 0;
  gasEstimate = 100_000n;
  sent: UnsignedTx[] = [];
  receiptStatus: Receipt['status'] = 'success';
  logs: Receipt['logs'] = [];
  failNextSendWith: string | null = null;
  estimateError: Error | null = null;
  private signed = new Map<Hex, UnsignedTx>();

  async estimateGas(): Promise<bigint> {
    if (this.estimateError) throw this.estimateError;
    return this.gasEstimate;
  }
  async getTransactionCount(): Promise<number> { return this.chainNonce; }
  async signTransaction(tx: UnsignedTx): Promise<Hex> {
    const raw = `0x${(this.signed.size + 1).toString(16).padStart(8, '0')}` as Hex;
    this.signed.set(raw, tx);
    return raw;
  }
  async sendRawTransaction(raw: Hex): Promise<Hex> {
    const tx = this.signed.get(raw)!;
    if (this.failNextSendWith) {
      const message = this.failNextSendWith;
      this.failNextSendWith = null;
      throw new Error(message);
    }
    if (tx.nonce < this.chainNonce) throw new Error('nonce too low');
    this.chainNonce = Math.max(this.chainNonce, tx.nonce + 1);
    this.sent.push(tx);
    return `0x${tx.nonce.toString(16).padStart(64, '0')}` as Hex;
  }
  async waitForReceipt(): Promise<Receipt> {
    return { status: this.receiptStatus, blockNumber: 1n, gasUsed: 21_000n, logs: this.logs };
  }
}
