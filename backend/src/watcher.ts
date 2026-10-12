import { DurableObject } from 'cloudflare:workers';
import type { Address, Hex } from 'viem';
import { FALLBACK_UTIL_BPS } from '../../lib/judge/gating';
import { JevUnavailable } from '../../lib/jev';
import { judgePositionDetailed, type DetailedPositionJudgment } from '../../lib/judge';
import type { Flows, PositionInput } from '../../lib/judge/state';
import { NETWORKS, UNDEPLOYED, type Network, type VaultConfig } from '../../shared/networks';
import type { PositionJudgment, VaultStats } from '../../shared/types';
import { toOraclePost, type StateDocument } from '../../shared/verdict';
import { postVerdict } from './archive';
import { afterJudgment, decide } from './decide';
import type { Env, ExitJob } from './env';
import { realEnvioDeps, readFlows, readProtections } from './envio';
import { safeError } from './errors';
import { addEvent } from './events';
import { readVault } from './vaultReader';

/** Workers Free allows 100k Durable Object requests a day; 4 testnet vaults at 5 s used ~69k of that on alarms alone. */
export const ALARM_MS: Record<Network, number> = { testnet: 15_000, mainnet: 30_000 };
/**
 * How often a steady watcher refreshes its vault_health row. Posts and error changes are written at once; the plain
 * "still alive" write waits this long, because a 5 s heartbeat for every testnet vault alone overruns D1 Free's 100k rows/day.
 */
export const HEARTBEAT_MS: Record<Network, number> = { testnet: 30_000, mainnet: 30_000 };

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

/**
 * After a verdict is onchain: tell protected owners, queue exits for those whose threshold it meets, and
 * alert the rest. Shared by the watcher and the admin drill so a drill behaves exactly like a real EXIT.
 */
export async function fanOut(
  db: D1Database, deps: Pick<WatcherDeps, 'readProtections' | 'enqueue'>, network: Network, vault: VaultConfig,
  id: bigint, judgment: PositionJudgment, txHash: Hex,
): Promise<void> {
  const address = vault.address as Address;
  const post = toOraclePost(judgment);
  const confidence = judgment.action.confidence;
  const protections = await deps.readProtections(network, vault);
  for (const { owner } of protections) {
    await addEvent(db, { network, vault: address, owner, type: 'posted', message: `Verdict #${id} posted onchain: ${judgment.action.value} at ${pct(post.confidenceBps)}`, txHash, confidence });
  }
  const { enqueue, alert } = afterJudgment(post, protections);
  for (const owner of enqueue) {
    await deps.enqueue({ network, vault: address, owner, verdictId: id.toString() });
    await addEvent(db, { network, vault: address, owner, type: 'exit_sent', message: `Guardian is pulling you out (Jev ${pct(post.confidenceBps)} sure)`, txHash, confidence });
  }
  if (alert) {
    const queued = new Set(enqueue.map((o) => o.toLowerCase()));
    const watchers = protections.filter((p) => !queued.has(p.owner.toLowerCase())).map((p) => p.owner);
    for (const owner of [null, ...watchers]) {
      await addEvent(db, { network, vault: address, owner, type: 'alert', message: `Jev says exit (${pct(post.confidenceBps)} sure). You can exit now.`, confidence });
    }
  }
}

/** last_error prefix marking a Jev outage, so the warning goes out once per outage, not once per tick. */
const JEV_DOWN = 'jev: ';

/** One watcher pass for one vault (plan Task 11). Never throws: failures land in vault_health and the events feed. */
export async function watchOnce(db: D1Database, vault: VaultConfig, network: Network, last: VaultStats | null, deps: WatcherDeps): Promise<VaultStats | null> {
  const address = vault.address as Address;
  const now = () => new Date().toISOString();
  // The upsert is a no-op (0 rows written) unless there is a new post, last_error changed, or the heartbeat is due.
  const health = (lastPostAt: string | null, error: string | null) => db.prepare(`INSERT INTO vault_health (network, vault, last_post_at, last_error, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (network, vault) DO UPDATE SET last_post_at = COALESCE(?3, last_post_at), last_error = ?4, updated_at = ?5
      WHERE ?3 IS NOT NULL OR vault_health.last_error IS NOT ?4 OR vault_health.updated_at <= ?6`)
    .bind(network, address.toLowerCase(), lastPostAt, error, now(), new Date(Date.now() - HEARTBEAT_MS[network]).toISOString()).run();
  const fail = (stage: string, err: unknown, prefix = '') => {
    const message = `${prefix}${safeError(err)}`;
    console.error(JSON.stringify({ msg: 'watch_failed', stage, network, vault: address, error: message }));
    return health(null, message);
  };

  let reading: VaultReading;
  let detail: DetailedPositionJudgment;
  let posted: { id: bigint; txHash: Hex };
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
    try {
      detail = await deps.judge(input);
    } catch (err) {
      if (!(err instanceof JevUnavailable)) throw err;
      const previous = await db.prepare('SELECT last_error FROM vault_health WHERE network = ? AND vault = ?').bind(network, address.toLowerCase()).first<string | null>('last_error');
      await fail('judge', err, JEV_DOWN);
      if (!previous?.startsWith(JEV_DOWN)) {
        const owners = await deps.readProtections(network, vault).then((ps) => ps.map((p) => p.owner), () => [] as Address[]);
        const urgent = reading.stats.utilBps >= FALLBACK_UTIL_BPS;
        for (const owner of [null, ...owners]) {
          await addEvent(db, { network, vault: address, owner, type: 'jev_unavailable', message: 'Jev is unreachable, so no verdict can be posted and Guardian cannot exit for you.' });
          if (urgent) await addEvent(db, { network, vault: address, owner, type: 'alert', message: `Utilization is ${pct(reading.stats.utilBps)} and Jev is down. Consider exiting.` });
        }
      }
      return last;
    }
    const doc: StateDocument = { v: 1, network, vault: address, state: detail.state, questions: detail.questions, answers: detail.answers, model: detail.model, at: now(), drill: false };
    posted = await deps.post(network, address, detail.judgment, doc);
  } catch (err) {
    await fail('post', err);
    return last;
  }

  // The verdict is onchain now: whatever fails below, these stats count as judged so the next tick doesn't post again.
  try {
    await health(now(), null);
    await addEvent(db, { network, vault: address, type: 'judged', message: `Jev: ${detail.judgment.action.value} at ${pct(toOraclePost(detail.judgment).confidenceBps)}`, txHash: posted.txHash, confidence: detail.judgment.action.confidence });
    await fanOut(db, deps, network, vault, posted.id, detail.judgment, posted.txHash);
  } catch (err) {
    await fail('fan_out', err).catch(() => undefined);
  }
  return reading.stats;
}

/** The vault's config if it should be watched: still listed, on a network whose oracle is deployed. */
function watched(network: Network, vault: Address): VaultConfig | undefined {
  if (NETWORKS[network].oracle === UNDEPLOYED) return undefined;
  return NETWORKS[network].vaults.find((v) => v.address.toLowerCase() === vault.toLowerCase());
}

/** Durable Object named `${network}:${vault}`: an alarm loop that watches one vault. */
export class VaultWatcher extends DurableObject<Env> {
  /** Built from env on first use; tests assign fakes. */
  deps: WatcherDeps | null = null;

  async start(network: Network, vault: Address): Promise<void> {
    if (!watched(network, vault)) { await this.ctx.storage.deleteAlarm(); return; }
    const prev = await this.ctx.storage.get<WatchState>('state');
    await this.ctx.storage.put('state', { network, vault, last: prev?.last ?? null } satisfies WatchState);
    // Re-arm unless a normal tick is already pending: an overdue alarm, or one pushed far out by retry backoff
    // (e.g. after hitting a plan limit), would otherwise leave the watcher silent.
    const at = await this.ctx.storage.getAlarm();
    const now = Date.now();
    if (at === null || at < now || at > now + ALARM_MS[network]) await this.ctx.storage.setAlarm(now + ALARM_MS[network]);
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<WatchState>('state');
    if (!state) return;
    const vault = watched(state.network, state.vault);
    if (!vault) return; // removed from config, or no oracle on that network: stop watching (no re-arm)
    try {
      const last = await watchOnce(this.env.DB, vault, state.network, state.last, this.deps ?? (this.deps = this.realDeps()));
      // watchOnce hands back the same object on a skip tick; only write when the judged stats moved.
      if (last !== state.last) await this.ctx.storage.put('state', { ...state, last } satisfies WatchState);
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
