import { afterAll, beforeAll, describe, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestIndexer } from 'generated';
import { TestHelpers } from 'envio';
import { START_BLOCKS } from '../src/startBlocks';

type Hex = `0x${string}`;
const CHAIN = 10143;
const VAULT: Hex = '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC';
const OWNER = TestHelpers.Addresses.mockAddresses[0]!;
const HOUR = 1_760_000_400;

// A fake Monad RPC that answers totalAssets() and records which block each call asked for.
let server: Server;
let calls: string[] = [];
let mode: 'ok' | 'historyMissing' = 'ok';

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msgs = [].concat(JSON.parse(body));
      const out = msgs.map((m: { id: number; method: string; params: unknown[] }) => {
        if (m.method === 'eth_chainId') return { jsonrpc: '2.0', id: m.id, result: '0x279f' };
        const block = String(m.params[1]);
        calls.push(block);
        if (mode === 'historyMissing' && block !== 'latest') return { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'state not available' } };
        return { jsonrpc: '2.0', id: m.id, result: '0x' + (1_000_000n).toString(16).padStart(64, '0') };
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(Array.isArray(JSON.parse(body)) ? out : out[0]));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ENVIO_RPC_URL_10143 = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  process.env.ENVIO_RPC_URL_10143 = '';
  server.close();
});

const withdraw = (assets: bigint, block: number) => ({
  contract: 'ERC4626Vault' as const,
  event: 'Withdraw' as const,
  srcAddress: VAULT,
  block: { number: block, timestamp: HOUR + block },
  transaction: { hash: `0x${block.toString(16).padStart(64, '0')}` as Hex },
  params: { sender: OWNER, receiver: OWNER, owner: OWNER, assets, shares: assets },
});

describe('RPC baseline for LargeWithdrawal', () => {
  it('reads totalAssets once per vault, just before the start block, however many events arrive', async (t) => {
    calls = [];
    mode = 'ok';
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: [100, 101, 102, 103, 104].map((b) => withdraw(1n, b)) } } });
    const before = Math.max((START_BLOCKS[CHAIN] ?? 0) - 1, 0);
    t.expect(calls).toEqual([`0x${before.toString(16)}`]);
    const state = await indexer.VaultState.getOrThrow(`${CHAIN}-${VAULT.toLowerCase()}`);
    t.expect(state).toMatchObject({ baselineFromRpc: true, trackedAssets: 1_000_000n - 5n });
  });

  it('falls back to flows-only, never to the latest block, when the node lacks that history', async (t) => {
    calls = [];
    mode = 'historyMissing';
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: [withdraw(1n, 100)] } } });
    t.expect(calls).not.toContain('latest');
    const state = await indexer.VaultState.getOrThrow(`${CHAIN}-${VAULT.toLowerCase()}`);
    t.expect(state.baselineFromRpc).toBe(false);
  });
});
