import { encodeFunctionData, parseEventLogs, type Address, type Hex } from 'viem';
import { abis } from '../../shared/contracts';
import { NETWORKS, type Network } from '../../shared/networks';
import type { PositionJudgment } from '../../shared/types';
import { canonicalJson, stateHash, toOraclePost, type StateDocument } from '../../shared/verdict';
import type { Env } from './env';
import { txSender, type Sender } from './txSender';

export const stateKey = (hash: Hex) => `state/${hash}.json`;

/** Stores exactly the bytes that were hashed, so anyone can re-hash the public file and match the onchain stateHash. */
export async function archiveState(env: Pick<Env, 'STATE'>, doc: StateDocument): Promise<Hex> {
  const hash = stateHash(doc);
  const key = stateKey(hash);
  if (!(await env.STATE.head(key))) {
    await env.STATE.put(key, canonicalJson(doc), { httpMetadata: { contentType: 'application/json' } });
  }
  return hash;
}

/** Archive first, then post: an onchain hash must never point at a file that doesn't exist. */
export async function postVerdict(
  env: Env, network: Network, vault: Address, judgment: PositionJudgment, doc: StateDocument,
  sender: Sender = txSender(env, network, 'attester'),
): Promise<{ id: bigint; txHash: Hex }> {
  const hash = await archiveState(env, doc);
  const { verdict, confidenceBps, riskBps } = toOraclePost(judgment);
  const oracle = NETWORKS[network].oracle;
  const receipt = await sender.send({
    to: oracle, kind: 'post',
    data: encodeFunctionData({ abi: abis.oracle, functionName: 'post', args: [vault, verdict, confidenceBps, riskBps, hash] }),
  });
  if (receipt.status !== 'success') throw new Error(`oracle.post reverted (${receipt.hash})`);
  const [posted] = parseEventLogs({ abi: abis.oracle, eventName: 'VerdictPosted', logs: receipt.logs as never });
  if (!posted) throw new Error(`no VerdictPosted in ${receipt.hash}`);
  const { id, postedAt } = posted.args;
  await env.DB.prepare(`INSERT OR IGNORE INTO posts (network, id, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at, tx_hash, drill)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(network, Number(id), vault.toLowerCase(), verdict, confidenceBps, riskBps, hash, Number(postedAt), receipt.hash, doc.drill ? 1 : 0).run();
  console.log(JSON.stringify({ msg: 'verdict_posted', network, vault, verdictId: id.toString(), txHash: receipt.hash, verdict, confidenceBps }));
  return { id, txHash: receipt.hash };
}
