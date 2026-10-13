import { keccak256, type Address, type Hex } from 'viem';
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
  /** The node accepts the tx but the response is lost and a retry answers with this error. */
  acceptButFailWith: string | null = null;
  receiptTimeout = false;
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
    this.known.add(keccak256(raw));
    if (this.acceptButFailWith) {
      const message = this.acceptButFailWith;
      this.acceptButFailWith = null;
      throw new Error(message);
    }
    return keccak256(raw);
  }
  private known = new Set<Hex>();
  async isKnown(hash: Hex): Promise<boolean> { return this.known.has(hash); }
  async waitForReceipt(): Promise<Receipt> {
    if (this.receiptTimeout) throw new Error('Timed out while waiting for transaction');
    return { status: this.receiptStatus, blockNumber: 1n, gasUsed: 21_000n, logs: this.logs };
  }
}
