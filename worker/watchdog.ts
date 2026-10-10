import { decideAction, shouldRejudge } from '../lib/judge/gating';
import { explainExitAlert, explainJudgment, sure } from '../shared/explain';
import type { Address, PositionJudgment, VaultStats, WatchEvent } from '../shared/types';

export interface StatsUpdate extends VaultStats { vault: Address }
export interface Enabled { owner: Address; vault: Address }
export interface ExitResult { txHash: Address; seconds: number; block?: bigint; assets?: bigint; remaining?: bigint }

const usdc = (x: bigint) => (Number(x) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }); // mirrors hold test USDC (6 decimals)
export interface JudgeInput { vault: Address; owner: Address | null; stats: VaultStats; atDeposit: VaultStats }

export interface WatchdogDeps {
  readStats(): Promise<StatsUpdate[]>;
  readEnabled(): Promise<Enabled[]>;
  judge(input: JudgeInput): Promise<PositionJudgment>;
  exit(vault: Address, owner: Address): Promise<ExitResult>;
  emit(event: WatchEvent): void | Promise<void>;
  retryDelayMs?: number;
}

const MAX_EXIT_RETRIES = 2;
const FALLBACK_UTIL_BPS = 9_500;

export function createWatchdog(deps: WatchdogDeps) {
  // Keyed by lowercase address: seeds come checksummed from the address book, log addresses come lowercase.
  const baseline = new Map<string, VaultStats>(); // stats the first time we saw the vault ("at deposit")
  const judged = new Map<string, VaultStats>(); // stats at the last judgement
  const key = (vault: Address) => vault.toLowerCase();
  let seq = 0;

  const emit = (e: Omit<WatchEvent, 'id' | 'at'>) =>
    deps.emit({ ...e, id: `${Date.now()}-${seq++}`, at: new Date().toISOString() });
  const reason = (err: unknown) => (err instanceof Error ? err.message.split('\n')[0] : String(err));
  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  async function exitWithRetries(vault: Address, owner: Address, confidence: number) {
    await emit({ vault, owner, type: 'exit_sent', confidence, message: `Jev is ${sure(confidence)} it's time to get out. Autopilot is withdrawing for you.` });
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_EXIT_RETRIES; attempt++) {
      try {
        const r = await deps.exit(vault, owner);
        await emit({ vault, owner, type: 'exit_confirmed', txHash: r.txHash, confidence,
          message: `Exit confirmed in ${r.seconds.toFixed(1)}s${r.block !== undefined ? ` · block ${r.block}` : ''}`
            + (r.remaining ? ` · partial: withdrew ${usdc(r.assets ?? 0n)} USDC, ${usdc(r.remaining)} USDC still locked until the vault has liquidity` : '') });
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_EXIT_RETRIES) await sleep(deps.retryDelayMs ?? 500);
      }
    }
    await emit({ vault, owner, type: 'exit_failed', confidence, message: `Exit failed: ${reason(lastErr)}` });
  }

  async function handle(vault: Address, stats: VaultStats) {
    const atDeposit = baseline.get(key(vault)) ?? stats;
    if (!baseline.has(key(vault))) baseline.set(key(vault), stats);
    if (!shouldRejudge(judged.get(key(vault)) ?? null, stats)) return;

    const owners = (await deps.readEnabled()).filter((e) => e.vault.toLowerCase() === vault.toLowerCase()).map((e) => e.owner);
    let j: PositionJudgment;
    try {
      j = await deps.judge({ vault, owner: owners[0] ?? null, stats, atDeposit });
    } catch (err) {
      // Jev unavailable: never auto-exit; single fallback rule.
      if (stats.utilBps > FALLBACK_UTIL_BPS) {
        await emit({ vault, type: 'alert', message: `Jev unavailable (${reason(err)}) · utilization ${(stats.utilBps / 100).toFixed(1)}% — consider exiting` });
      }
      return;
    }
    judged.set(key(vault), stats);
    await emit({ vault, type: 'judged', confidence: j.action.confidence, judgment: j,
      message: explainJudgment(j) });

    const alertMsg = explainExitAlert(j.action.confidence);
    if (owners.length === 0) {
      const a = decideAction(j, false);
      if (a === 'alert') await emit({ vault, type: 'alert', confidence: j.action.confidence, message: alertMsg });
      return;
    }
    for (const owner of owners) {
      const a = decideAction(j, true);
      if (a === 'auto_exit') await exitWithRetries(vault, owner, j.action.confidence);
      else if (a === 'alert') await emit({ vault, owner, type: 'alert', confidence: j.action.confidence, message: alertMsg });
    }
  }

  return {
    /** Record the current stats as the baseline without judging (used at startup). */
    seed(all: StatsUpdate[]) {
      for (const s of all) baseline.set(key(s.vault), { apyBps: s.apyBps, utilBps: s.utilBps });
      for (const s of all) judged.set(key(s.vault), { apyBps: s.apyBps, utilBps: s.utilBps });
    },
    async tick() {
      const updates = await deps.readStats();
      const latest = new Map<Address, VaultStats>();
      for (const u of updates) {
        await emit({ vault: u.vault, type: 'stats_changed', message: `Stats changed · APY ${(u.apyBps / 100).toFixed(2)}% · utilization ${(u.utilBps / 100).toFixed(1)}%` });
        latest.set(u.vault, { apyBps: u.apyBps, utilBps: u.utilBps });
      }
      for (const [vault, stats] of latest) await handle(vault, stats);
    },
  };
}
