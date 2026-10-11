import { DurableObject } from 'cloudflare:workers';
import { keccak256, type Address, type Hex } from 'viem';
import { NETWORKS, type Network } from '../../shared/networks';
import { viemChainClient, type ChainClient, type Receipt } from './chain';
import { rpcFor, secretFor, type Env, type KeyRole } from './env';

export type TxKind = 'post' | 'exit' | 'resolve' | 'admin';
export interface SendRequest { to: Address; data: Hex; kind: TxKind }
/** `pending`: broadcast, but no receipt within the wait. The tx may still land; callers keep the hash and check later. */
export interface SendResult extends Omit<Receipt, 'status'> { hash: Hex; status: Receipt['status'] | 'pending' }

/** Monad bills the gas limit, so the limit is the estimate plus a 15% margin, rounded up. */
export const gasLimit = (estimate: bigint) => (estimate * 115n + 99n) / 100n;

const NONCE_ERROR = /nonce too low|nonce has already been used|already known|replacement transaction underpriced/i;

/**
 * Serialized sends for one key: one nonce per tx, in order, with no gaps from failed estimates.
 * Receipts are awaited outside the lock so a slow block doesn't hold up the next send.
 */
export class NonceSender {
  private lock: Promise<unknown> = Promise.resolve();
  private synced = false;

  constructor(private readonly deps: {
    storage: DurableObjectStorage; db: D1Database; chain: ChainClient; network: Network; role: KeyRole;
  }) {}

  async send(req: SendRequest): Promise<SendResult> {
    const { hash, nonce } = await this.exclusive(() => this.broadcast(req));
    let receipt: Receipt;
    try {
      receipt = await this.deps.chain.waitForReceipt(hash);
    } catch {
      await this.log(nonce, hash, req.kind, 'pending');
      return { hash, status: 'pending', blockNumber: 0n, gasUsed: 0n, logs: [] };
    }
    await this.log(nonce, hash, req.kind, receipt.status);
    return { hash, ...receipt };
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async broadcast(req: SendRequest): Promise<{ hash: Hex; nonce: number }> {
    const { chain, storage } = this.deps;
    const gas = gasLimit(await chain.estimateGas({ to: req.to, data: req.data }));
    if (!this.synced) await this.resync();
    for (let attempt = 0; ; attempt++) {
      const nonce = (await storage.get<number>('nonce')) ?? 0;
      const raw = await chain.signTransaction({ to: req.to, data: req.data, nonce, gas });
      const hash = keccak256(raw);
      try {
        await chain.sendRawTransaction(raw);
      } catch (err) {
        // The transport retries sends; if an earlier try was accepted, the error is about our own tx. Never sign it twice.
        if (await chain.isKnown(hash)) { await storage.put('nonce', nonce + 1); return { hash, nonce }; }
        if (attempt === 0 && NONCE_ERROR.test(String(err))) { await this.resync(); continue; }
        throw err;
      }
      await storage.put('nonce', nonce + 1);
      return { hash, nonce };
    }
  }

  private async resync(): Promise<void> {
    await this.deps.storage.put('nonce', await this.deps.chain.getTransactionCount());
    this.synced = true;
  }

  private async log(nonce: number, hash: Hex, kind: TxKind, status: string): Promise<void> {
    const { db, network, role } = this.deps;
    await db.prepare('INSERT INTO tx_log (network, key_role, nonce, hash, kind, status, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(network, role, nonce, hash, kind, status, new Date().toISOString()).run();
    console.log(JSON.stringify({ msg: 'tx', network, role, nonce, txHash: hash, kind, status }));
  }
}

/** Durable Object named `${network}:${role}`; the only place a backend key signs. */
export class TxSender extends DurableObject<Env> {
  private sender: NonceSender | null = null;

  async send(req: SendRequest & { network: Network; role: KeyRole }): Promise<SendResult> {
    if (!this.sender) {
      const chain = viemChainClient(NETWORKS[req.network].chain, rpcFor(this.env, req.network), secretFor(this.env, req.role, req.network));
      this.sender = new NonceSender({ storage: this.ctx.storage, db: this.env.DB, chain, network: req.network, role: req.role });
    }
    return this.sender.send({ to: req.to, data: req.data, kind: req.kind });
  }
}

/** What callers use: the DO for this (network, role), already bound to them. */
export interface Sender { send(req: SendRequest): Promise<SendResult> }

export function txSender(env: Env, network: Network, role: KeyRole): Sender {
  const stub = env.TX_SENDER.get(env.TX_SENDER.idFromName(`${network}:${role}`)) as unknown as TxSender;
  return { send: (req) => stub.send({ ...req, network, role }) };
}
