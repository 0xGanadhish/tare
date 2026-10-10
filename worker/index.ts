import { readFileSync } from 'node:fs';
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
  let guardianFrom = fromBlock;
  const enabledSet = new Map<string, Enabled>();
  // Rebuild autopilot state from chain logs (Guardian was deployed recently; one full replay is cheap).
  async function replayEnabled(from: bigint, to: bigint) {
    for (let start = from; start <= to; start += CHUNK) {
      const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to;
      await replayRange(start, end);
    }
  }
  async function replayRange(from: bigint, to: bigint) {
    const [en, dis] = await Promise.all([
      publicClient.getLogs({ address: guardian, event: enabledEvent, fromBlock: from, toBlock: to }),
      publicClient.getLogs({ address: guardian, event: disabledEvent, fromBlock: from, toBlock: to }),
    ]);
    const all = [...en.map((l) => ({ l, on: true })), ...dis.map((l) => ({ l, on: false }))]
      .sort((a, b) => Number(a.l.blockNumber! - b.l.blockNumber!) || (a.l.logIndex! - b.l.logIndex!));
    for (const { l, on } of all) {
      const key = `${l.args.owner}:${l.args.vault}`.toLowerCase();
      if (on) enabledSet.set(key, { owner: l.args.owner as Address, vault: l.args.vault as Address });
      else enabledSet.delete(key);
    }
  }
  await replayEnabled(deployBlock(fromBlock), fromBlock).catch((e) => log('enabled replay failed', e instanceof Error ? e.message.split('\n')[0] : e));

  const wd = createWatchdog({
    async readStats() {
      const head = await publicClient.getBlockNumber();
      if (head <= fromBlock) return [];
      const from = fromBlock + 1n;
      const logs = await publicClient.getLogs({ address: vaults, event: statsEvent, fromBlock: from, toBlock: head });
      await replayEnabled(guardianFrom + 1n, head);
      guardianFrom = head;
      fromBlock = head;
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
