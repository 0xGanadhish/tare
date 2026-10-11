import { DurableObject } from 'cloudflare:workers';
import type { Address, Hex } from 'viem';
import { FALLBACK_UTIL_BPS } from '../../lib/judge/gating';
import { JevUnavailable } from '../../lib/jev';
import { judgePositionDetailed, type DetailedPositionJudgment } from '../../lib/judge';
import type { Flows, PositionInput } from '../../lib/judge/state';
import { NETWORKS, type Network, type VaultConfig } from '../../shared/networks';
import type { PositionJudgment, VaultStats } from '../../shared/types';
import { toOraclePost, type StateDocument } from '../../shared/verdict';
import { postVerdict } from './archive';
import { afterJudgment, decide } from './decide';
import type { Env, ExitJob } from './env';
import { realEnvioDeps, readFlows, readProtections } from './envio';
import { addEvent } from './events';
import { readVault } from './vaultReader';

export const ALARM_MS: Record<Network, number> = { testnet: 5_000, mainnet: 30_000 };

export interface VaultReading { stats: VaultStats & { liquidityPct: number | null }; totalAssets: bigint; pps: bigint }
export interface Protection { owner: Address; minConfidenceBps: number }

export interface WatcherDeps {
  readVault(network: Network, vault: VaultConfig): Promise<VaultReading>;
  readFlows(network: Network, vault: VaultConfig, reading: VaultReading): Promise<Flows | null>;
  readProtections(network: Network, vault: VaultConfig): Promise<Protection[]>;
  judge(input: PositionInput): Promise<DetailedPositionJudgment>;
  post(network: Network, vault: Address, judgment: PositionJudgment, doc: StateDocument): Promise<{ id: bigint; txHash: Hex }>;
  enqueue(job: ExitJob): Promise<void>;
}

interface WatchState { network: Network; vault: Address; last: VaultStats | null }

const pct = (bps: number) => `${(bps / 100).toFixed(0)}%`;

/** One watcher pass for one vault (plan Task 11). Never throws: failures land in vault_health and the events feed. */
export async function watchOnce(db: D1Database, vault: VaultConfig, network: Network, last: VaultStats | null, deps: WatcherDeps): Promise<VaultStats | null> {
  const address = vault.address as Address;
  const now = () => new Date().toISOString();
  const health = (lastPostAt: string | null, error: string | null) => db.prepare(`INSERT INTO vault_health (network, vault, last_post_at, last_error, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (network, vault) DO UPDATE SET last_post_at = COALESCE(?3, last_post_at), last_error = ?4, updated_at = ?5`)
    .bind(network, address.toLowerCase(), lastPostAt, error, now()).run();

  let reading: VaultReading | null = null;
  try {
    reading = await deps.readVault(network, vault);
    const flows = await deps.readFlows(network, vault, reading);
    const hasPost = (await db.prepare('SELECT 1 FROM posts WHERE network = ? AND vault = ? LIMIT 1').bind(network, address.toLowerCase()).first()) !== null;
    if (decide({ stats: reading.stats, last, flows, hasPost }) === 'skip') {
      await health(null, null);
      return last;
    }
    const input: PositionInput = {
      position: { vault: address, mirrorOf: vault.name, shares: '0', assets: reading.totalAssets.toString(), apyBps: reading.stats.apyBps, utilBps: reading.stats.utilBps, autopilot: true, judgment: null },
      atDeposit: last ?? reading.stats, alternative: null, protocolName: vault.protocol, isMirror: vault.protocol === 'mirror',
      flows, liquidityPct: reading.stats.liquidityPct,
    };
    const detail = await deps.judge(input);
    const doc: StateDocument = { v: 1, network, vault: address, state: detail.state, questions: detail.questions, answers: detail.answers, model: detail.model, at: now(), drill: false };
    const { id, txHash } = await deps.post(network, address, detail.judgment, doc);
    await health(now(), null);
    const post = toOraclePost(detail.judgment);
    await addEvent(db, { network, vault: address, type: 'judged', message: `Jev: ${detail.judgment.action.value} at ${pct(post.confidenceBps)}`, txHash, confidence: detail.judgment.action.confidence });
    const protections = await deps.readProtections(network, vault);
    for (const { owner } of protections) {
      await addEvent(db, { network, vault: address, owner, type: 'posted', message: `Verdict #${id} posted onchain: ${detail.judgment.action.value} at ${pct(post.confidenceBps)}`, txHash, confidence: detail.judgment.action.confidence });
    }
    const { enqueue, alert } = afterJudgment(post, protections);
    for (const owner of enqueue) {
      await deps.enqueue({ network, vault: address, owner, verdictId: id.toString() });
      await addEvent(db, { network, vault: address, owner, type: 'exit_sent', message: `Guardian is pulling you out (Jev ${pct(post.confidenceBps)} sure)`, txHash, confidence: detail.judgment.action.confidence });
    }
    if (alert) {
      const queued = new Set(enqueue.map((o) => o.toLowerCase()));
      const watchers = protections.filter((p) => !queued.has(p.owner.toLowerCase())).map((p) => p.owner);
      for (const owner of [null, ...watchers]) {
        await addEvent(db, { network, vault: address, owner, type: 'alert', message: `Jev says exit (${pct(post.confidenceBps)} sure). You can exit now.`, confidence: detail.judgment.action.confidence });
      }
    }
    return reading.stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ msg: 'watch_failed', network, vault: address, error: message }));
    await health(null, message);
    if (err instanceof JevUnavailable) {
      await addEvent(db, { network, vault: address, type: 'jev_unavailable', message: 'Jev is unreachable; no verdict posted, so Guardian cannot exit.' });
      if (reading && reading.stats.utilBps >= FALLBACK_UTIL_BPS) {
        await addEvent(db, { network, vault: address, type: 'alert', message: `Utilization is ${pct(reading.stats.utilBps)} and Jev is down. Consider exiting.` });
      }
    }
    return last;
  }
}

/** Durable Object named `${network}:${vault}`: an alarm loop that watches one vault. */
export class VaultWatcher extends DurableObject<Env> {
  /** Built from env on first use; tests assign fakes. */
  deps: WatcherDeps | null = null;

  async start(network: Network, vault: Address): Promise<void> {
    const prev = await this.ctx.storage.get<WatchState>('state');
    await this.ctx.storage.put('state', { network, vault, last: prev?.last ?? null } satisfies WatchState);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + ALARM_MS[network]);
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<WatchState>('state');
    if (!state) return;
    try {
      const vault = NETWORKS[state.network].vaults.find((v) => v.address.toLowerCase() === state.vault.toLowerCase());
      if (!vault) return; // removed from config: stop watching
      const last = await watchOnce(this.env.DB, vault, state.network, state.last, this.deps ?? (this.deps = this.realDeps()));
      await this.ctx.storage.put('state', { ...state, last } satisfies WatchState);
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_MS[state.network]);
    }
  }

  private realDeps(): WatcherDeps {
    const env = this.env;
    // jev() reads the key from process.env; nodejs_compat populates it from bindings, this makes it explicit.
    if (env.TYPESAFE_API_KEY) process.env.TYPESAFE_API_KEY = env.TYPESAFE_API_KEY;
    const envio = realEnvioDeps(env);
    return {
      readVault: (network, vault) => readVault(env, network, vault),
      readFlows: (network, vault, reading) => readFlows(envio, network, vault.address as Address, Math.floor(Date.now() / 1000), reading.totalAssets),
      readProtections: (network, vault) => readProtections(env.DB, envio, network, vault.address as Address),
      judge: (input) => judgePositionDetailed(input),
      post: (network, vault, judgment, doc) => postVerdict(env, network, vault, judgment, doc),
      enqueue: async (job) => { await env.EXITS.send(job); },
    };
  }
}

export function watcherFor(env: Env, network: Network, vault: Address): VaultWatcher {
  return env.VAULT_WATCHER.get(env.VAULT_WATCHER.idFromName(`${network}:${vault.toLowerCase()}`)) as unknown as VaultWatcher;
}
