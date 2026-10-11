import { BaseError, ContractFunctionRevertedError, createPublicClient, encodeFunctionData, formatUnits, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { abis } from '../../shared/contracts';
import { NETWORKS, type Network } from '../../shared/networks';
import { addEvent } from './events';
import { rpcFor, secretFor, type Env, type ExitJob } from './env';
import { txSender, type Sender } from './txSender';

export const MAX_ATTEMPTS = 3;
/** A claim older than this is presumed dead (the consumer crashed mid-send) and may be taken over. */
const STALE_CLAIM_MS = 120_000;
const USDC_DECIMALS = 6;

export interface ExitDeps {
  /** eth_call of GuardianV2.exit from the executor: null if it would succeed, else the revert's error name. */
  simulate(job: ExitJob): Promise<string | null>;
  sender(network: Network): Sender;
}

export function realExitDeps(env: Env): ExitDeps {
  return {
    async simulate(job) {
      const client = createPublicClient({ chain: NETWORKS[job.network].chain, transport: http(rpcFor(env, job.network), { retryCount: 2 }) });
      const account = privateKeyToAccount(secretFor(env, 'executor', job.network)).address;
      try {
        await client.simulateContract({ address: NETWORKS[job.network].guardian, abi: abis.guardianV2, functionName: 'exit', args: [job.vault, job.owner], account });
        return null;
      } catch (err) {
        const revert = err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
        if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.reason ?? 'reverted';
        throw err; // RPC trouble, not a revert: retry the message
      }
    },
    sender: (network) => txSender(env, network, 'executor'),
  };
}

const usdc = (n: bigint) => Number(formatUnits(n, USDC_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 });

type Outcome = { ack: true } | { ack: false; delaySeconds: number };

async function processJob(env: Env, job: ExitJob, attempts: number, deps: ExitDeps): Promise<Outcome> {
  const { network, verdictId } = job;
  const owner = job.owner.toLowerCase();
  const key = [network, verdictId, owner] as const;
  const now = new Date();
  const claim = await env.DB.prepare(`INSERT INTO exits (network, verdict_id, owner, status, at) VALUES (?1, ?2, ?3, 'sending', ?4)
    ON CONFLICT (network, verdict_id, owner) DO UPDATE SET status = 'sending', error = NULL, at = ?4
    WHERE exits.status = 'failed' OR (exits.status = 'sending' AND exits.at < ?5)`)
    .bind(...key, now.toISOString(), new Date(now.getTime() - STALE_CLAIM_MS).toISOString()).run();
  if (claim.meta.changes === 0) {
    const status = await env.DB.prepare('SELECT status FROM exits WHERE network = ? AND verdict_id = ? AND owner = ?').bind(...key).first<string>('status');
    return status === 'sending' ? { ack: false, delaySeconds: 30 } : { ack: true }; // in flight elsewhere, or already settled
  }
  const update = (fields: string, ...values: unknown[]) => env.DB.prepare(`UPDATE exits SET ${fields}, at = ? WHERE network = ? AND verdict_id = ? AND owner = ?`)
    .bind(...values, new Date().toISOString(), ...key).run();
  const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ msg, network, vault: job.vault, owner, verdictId, ...extra }));

  try {
    const reason = await deps.simulate(job);
    if (reason !== null) {
      await update(`status = 'skipped', error = ?`, reason);
      await addEvent(env.DB, { network, vault: job.vault, owner, type: 'exit_skipped', message: `Guardian did not exit: ${reason}` });
      log('exit_skipped', { reason });
      return { ack: true };
    }
    const receipt = await deps.sender(network).send({
      to: NETWORKS[network].guardian, kind: 'exit',
      data: encodeFunctionData({ abi: abis.guardianV2, functionName: 'exit', args: [job.vault, job.owner] }),
    });
    if (receipt.status !== 'success') throw new Error(`exit reverted (${receipt.hash})`);
    const [exited] = parseEventLogs({ abi: abis.guardianV2, eventName: 'Exited', logs: receipt.logs as never });
    const { shares = 0n, assets = 0n, remainingShares = 0n } = exited?.args ?? {};
    await update(`status = 'confirmed', tx_hash = ?, assets = ?, remaining_shares = ?`, receipt.hash, assets.toString(), remainingShares.toString());
    // Remaining shares valued at this exit's own share price, so no extra RPC is needed for the message.
    const message = remainingShares === 0n || shares === 0n ? "You're out" : `Partly out: ${usdc((remainingShares * assets) / shares)} USDC still locked`;
    await addEvent(env.DB, { network, vault: job.vault, owner, type: 'exit_confirmed', message, txHash: receipt.hash });
    log('exit_confirmed', { txHash: receipt.hash });
    return { ack: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await update(`status = 'failed', error = ?`, message);
    log('exit_attempt_failed', { attempts, error: message });
    if (attempts < MAX_ATTEMPTS) return { ack: false, delaySeconds: 2 ** attempts };
    await addEvent(env.DB, { network, vault: job.vault, owner, type: 'exit_failed', message: 'Guardian could not exit for you. Exit manually from Watch.' });
    return { ack: true };
  }
}

/** Queue consumer for `tare-exits` (plan Task 12). One tx per (network, verdictId, owner), however often a job arrives. */
export async function handleExitBatch(batch: MessageBatch<ExitJob>, env: Env, deps: ExitDeps = realExitDeps(env)): Promise<void> {
  for (const msg of batch.messages) {
    const outcome = await processJob(env, msg.body, msg.attempts, deps);
    if (outcome.ack) msg.ack();
    else msg.retry({ delaySeconds: outcome.delaySeconds });
  }
}
