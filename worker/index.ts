import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseAbiItem } from 'viem';
import { appendEvent } from '../shared/cache';
import { abis, addresses } from '../shared/contracts';
import { judgePosition } from '../lib/judge';
import type { Address, Position } from '../shared/types';
import { sendExit, publicClient } from './operator';
import { createWatchdog, type Enabled, type StatsUpdate } from './watchdog';

try { process.loadEnvFile('.env'); } catch { /* env may come from the shell */ }

const POLL_MS = 1_000;
const REFRESH_MS = 10 * 60_000;

const mirrors = (addresses.mirrors ?? []);
const vaults = mirrors.map((m) => m.address);
const guardian = addresses.guardian;

const statsEvent = parseAbiItem('event StatsUpdated(uint16 apyBps, uint16 utilizationBps, uint256 timestamp)');
const enabledEvent = parseAbiItem('event Enabled(address indexed owner, address indexed vault)');
const disabledEvent = parseAbiItem('event Disabled(address indexed owner, address indexed vault)');

const CHUNK = 100n; // the public RPC caps getLogs ranges
const MAX_CATCHUP_CHUNKS = 20n; // per tick, so a backlog drains in a few seconds
const CONCURRENCY = 8;

interface WorkerState { guardian: Address; lastBlock: string; enabled: Enabled[] }
const stateFile = () => join(process.env.CACHE_DIR ?? join(process.cwd(), 'cache'), 'worker-state.json');
function loadState(): WorkerState | null {
  try { return JSON.parse(readFileSync(stateFile(), 'utf8')) as WorkerState; } catch { return null; }
}
function persistState(st: WorkerState) {
  try {
    mkdirSync(dirname(stateFile()), { recursive: true });
    writeFileSync(`${stateFile()}.tmp`, JSON.stringify(st));
    renameSync(`${stateFile()}.tmp`, stateFile());
  } catch { /* state is an optimisation only */ }
}

/** First block of the testnet deploy (from the Foundry broadcast), so the Guardian replay stays short. */
function deployBlock(head: bigint): bigint {
  try {
    const run = JSON.parse(readFileSync('contracts/broadcast/Deploy.s.sol/10143/run-latest.json', 'utf8'));
    const blocks = (run.receipts as { blockNumber: string }[]).map((r) => BigInt(r.blockNumber));
    return blocks.reduce((a, b) => (a < b ? a : b));
  } catch {
    return head > 5_000n ? head - 5_000n : 0n;
  }
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[worker]', ...a);

async function currentStats(): Promise<StatsUpdate[]> {
  return Promise.all(vaults.map(async (vault) => {
    const [apyBps, utilBps] = await Promise.all([
      publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'apyBps' }),
      publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'utilizationBps' }),
    ]);
    return { vault, apyBps: Number(apyBps), utilBps: Number(utilBps) };
  }));
}

async function main() {
  if (!guardian || vaults.length === 0) { log('no deployed addresses in shared/addresses.testnet.json — nothing to watch'); return; }

  // refreshPools is built by B4; tolerate its absence.
  const refresh = async () => {
    try {
      const path = '../lib/jobs/refreshPools'; // variable path: B4 may not have landed yet
      const mod = await import(path);
      await mod.refreshPools();
      log('refreshPools ok');
    } catch (err) {
      log('refreshPools unavailable', err instanceof Error ? err.message.split('\n')[0] : err);
    }
  };

  let fromBlock = await publicClient.getBlockNumber();
  const enabledSet = new Map<string, Enabled>();
  // Resume from cache/worker-state.json (last replayed block + enabled set); replay only the delta.
  let guardianFrom = deployBlock(fromBlock) - 1n; // last block already applied to enabledSet
  const saved = loadState();
  if (saved && saved.guardian.toLowerCase() === guardian.toLowerCase() && BigInt(saved.lastBlock) <= fromBlock) {
    guardianFrom = BigInt(saved.lastBlock);
    for (const e of saved.enabled) enabledSet.set(`${e.owner}:${e.vault}`.toLowerCase(), e);
  }
  let lastSave = 0;
  const saveState = (force = false) => {
    if (!force && Date.now() - lastSave < 30_000) return;
    lastSave = Date.now();
    persistState({ guardian, lastBlock: guardianFrom.toString(), enabled: [...enabledSet.values()] });
  };

  async function fetchRange(from: bigint, to: bigint) {
    const logs = await publicClient.getLogs({ address: guardian, events: [enabledEvent, disabledEvent], fromBlock: from, toBlock: to });
    return logs.map((l) => ({ l, on: l.eventName === 'Enabled' }))
      .sort((a, b) => Number(a.l.blockNumber! - b.l.blockNumber!) || (a.l.logIndex! - b.l.logIndex!));
  }
  /** Replay (guardianFrom, to] in parallel batches of chunks, applying results in block order. */
  async function replayEnabled(to: bigint) {
    while (guardianFrom < to) {
      const ranges: [bigint, bigint][] = [];
      for (let start = guardianFrom + 1n; start <= to && ranges.length < CONCURRENCY; start += CHUNK) {
        ranges.push([start, start + CHUNK - 1n < to ? start + CHUNK - 1n : to]);
      }
      const results = await Promise.all(ranges.map(([f, t]) => fetchRange(f, t)));
      for (const all of results) {
        for (const { l, on } of all) {
          const key = `${l.args.owner}:${l.args.vault}`.toLowerCase();
          if (on) enabledSet.set(key, { owner: l.args.owner as Address, vault: l.args.vault as Address });
          else enabledSet.delete(key);
        }
      }
      guardianFrom = ranges[ranges.length - 1][1];
      saveState(true);
    }
  }
  await replayEnabled(fromBlock).catch((e) => log('enabled replay failed', e instanceof Error ? e.message.split('\n').slice(0, 4).join(' | ') : e));

  const readStatsChunk = (fromBlock: bigint, toBlock: bigint) =>
    publicClient.getLogs({ address: vaults, event: statsEvent, fromBlock, toBlock });

  const wd = createWatchdog({
    async readStats() {
      const head = await publicClient.getBlockNumber();
      if (head <= fromBlock) return [];
      // The public RPC rejects getLogs ranges over 100 blocks. Read in chunks and never ask for
      // more than MAX_CATCHUP_CHUNKS per tick, so one failed tick can't snowball into a range
      // that fails forever; fromBlock only advances past chunks that were read.
      const to = head - fromBlock > CHUNK * MAX_CATCHUP_CHUNKS ? fromBlock + CHUNK * MAX_CATCHUP_CHUNKS : head;
      const logs: Awaited<ReturnType<typeof readStatsChunk>> = [];
      for (let start = fromBlock + 1n; start <= to; start += CHUNK) {
        const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to;
        try {
          logs.push(...(await readStatsChunk(start, end)));
        } catch (e) {
          if (logs.length === 0) throw e; // nothing to lose; report the failure
          break; // keep what was read; the next tick resumes at this chunk
        }
        fromBlock = end;
      }
      const before = enabledSet.size;
      await replayEnabled(fromBlock);
      if (enabledSet.size !== before) saveState(true);
      return logs
        .sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || (a.logIndex! - b.logIndex!))
        .map((l) => ({ vault: l.address as Address, apyBps: Number(l.args.apyBps), utilBps: Number(l.args.utilizationBps) }));
    },
    async readEnabled() { return [...enabledSet.values()]; },
    async judge({ vault, owner, stats, atDeposit }) {
      const info = mirrors.find((m) => m.address.toLowerCase() === vault.toLowerCase());
      let shares = 0n; let assets = 0n;
      if (owner) {
        shares = await publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'balanceOf', args: [owner] });
        assets = await publicClient.readContract({ address: vault, abi: abis.mirrorVault, functionName: 'convertToAssets', args: [shares] });
      }
      const position: Position = { vault, mirrorOf: info?.mirrorOf ?? vault, shares: shares.toString(), assets: assets.toString(),
        apyBps: stats.apyBps, utilBps: stats.utilBps, autopilot: owner !== null, judgment: null };
      return judgePosition({ position, atDeposit, alternative: null });
    },
    exit: sendExit,
    emit: async (e) => { log(e.type, e.message); await appendEvent(e); },
  });
  wd.seed(await currentStats());

  log(`watching ${vaults.length} vaults · ${enabledSet.size} autopilot positions · from block ${fromBlock}`);
  await refresh();
  const refreshTimer = setInterval(refresh, REFRESH_MS);

  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try { await wd.tick(); } catch (err) { log('tick failed', err instanceof Error ? err.message.split('\n')[0] : err); }
    finally { ticking = false; }
  }, POLL_MS);

  process.on('SIGINT', () => { clearInterval(timer); clearInterval(refreshTimer); log('stopped'); process.exit(0); });
}

main().catch((err) => { console.error(err); process.exit(1); });
