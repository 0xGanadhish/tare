import { describe, it } from 'vitest';
import { createTestIndexer } from 'generated';
import { TestHelpers } from 'envio';

const { Addresses } = TestHelpers;
const CHAIN = 10143;
type Hex = `0x${string}`;
const VAULT: Hex = '0x7504b078d1F2b90fb9fcAf3d22753311013EA0aC';
const OWNER = Addresses.mockAddresses[0]!;
const KEEPER = Addresses.mockAddresses[1]!;
const STATE_HASH: Hex = `0x${'ab'.repeat(32)}`;
const TX: Hex = `0x${'11'.repeat(32)}`;
const HOUR = 1_760_000_400; // a UTC hour boundary (divisible by 3600)

const post = (id: bigint, verdict = 1n, block = 100) => ({
  contract: 'TareRiskOracle' as const,
  event: 'VerdictPosted' as const,
  block: { number: block, timestamp: HOUR },
  transaction: { hash: TX },
  params: { id, vault: VAULT, verdict, confidenceBps: 9500n, riskBps: 300n, stateHash: STATE_HASH, postedAt: BigInt(HOUR) },
});

const withdraw = (assets: bigint, timestamp: number, block: number) => ({
  contract: 'ERC4626Vault' as const,
  event: 'Withdraw' as const,
  srcAddress: VAULT,
  block: { number: block, timestamp },
  transaction: { hash: `0x${block.toString(16).padStart(64, '0')}` as Hex },
  params: { sender: OWNER, receiver: OWNER, owner: OWNER, assets, shares: assets },
});

const deposit = (assets: bigint, timestamp: number, block: number) => ({
  contract: 'ERC4626Vault' as const,
  event: 'Deposit' as const,
  srcAddress: VAULT,
  block: { number: block, timestamp },
  transaction: { hash: `0x${block.toString(16).padStart(64, '0')}` as Hex },
  params: { sender: OWNER, owner: OWNER, assets, shares: assets },
});

describe('TareRiskOracle', () => {
  it('VerdictPosted creates Verdict', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: [post(7n)] } } });
    t.expect(await indexer.Verdict.getOrThrow(`${CHAIN}-7`)).toEqual({
      id: `${CHAIN}-7`,
      chainId: CHAIN,
      postId: 7n,
      vault: VAULT.toLowerCase(),
      verdict: 'EXIT',
      confidenceBps: 9500,
      riskBps: 300,
      stateHash: STATE_HASH,
      postedAt: BigInt(HOUR),
      txHash: TX,
      resolved: false,
      adverse: undefined,
      reasons: undefined,
      resolvedAt: undefined,
    });
  });

  it('maps verdict 0 and 2 to HOLD and MOVE', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: [post(1n, 0n, 100), post(2n, 2n, 101)] } } });
    t.expect((await indexer.Verdict.getOrThrow(`${CHAIN}-1`)).verdict).toBe('HOLD');
    t.expect((await indexer.Verdict.getOrThrow(`${CHAIN}-2`)).verdict).toBe('MOVE');
  });

  it('VerdictResolved updates it', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            post(7n),
            {
              contract: 'TareRiskOracle',
              event: 'VerdictResolved',
              block: { number: 200, timestamp: HOUR + 3700 },
              params: { id: 7n, adverse: true, reasons: 5n },
            },
          ],
        },
      },
    });
    const v = await indexer.Verdict.getOrThrow(`${CHAIN}-7`);
    t.expect({ resolved: v.resolved, adverse: v.adverse, reasons: v.reasons, resolvedAt: v.resolvedAt }).toEqual({
      resolved: true,
      adverse: true,
      reasons: 5,
      resolvedAt: BigInt(HOUR + 3700),
    });
  });
});

describe('GuardianV2', () => {
  it('Enabled then Disabled flips Protection.enabled', async (t) => {
    const indexer = createTestIndexer();
    const id = `${CHAIN}-${OWNER.toLowerCase()}-${VAULT.toLowerCase()}`;
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: 'GuardianV2',
              event: 'Enabled',
              block: { number: 100, timestamp: HOUR },
              params: { owner: OWNER, vault: VAULT, minConfidenceBps: 9000n, maxAge: 600n },
            },
          ],
        },
      },
    });
    t.expect(await indexer.Protection.getOrThrow(id)).toEqual({
      id,
      chainId: CHAIN,
      owner: OWNER.toLowerCase(),
      vault: VAULT.toLowerCase(),
      enabled: true,
      minConfidenceBps: 9000,
      maxAge: 600,
      updatedAt: BigInt(HOUR),
    });

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: 'GuardianV2',
              event: 'Disabled',
              block: { number: 101, timestamp: HOUR + 60 },
              params: { owner: OWNER, vault: VAULT },
            },
          ],
        },
      },
    });
    const p = await indexer.Protection.getOrThrow(id);
    t.expect({ enabled: p.enabled, minConfidenceBps: p.minConfidenceBps, updatedAt: p.updatedAt }).toEqual({
      enabled: false,
      minConfidenceBps: 9000,
      updatedAt: BigInt(HOUR + 60),
    });
  });

  it('Exited links to Verdict by latest id', async (t) => {
    const indexer = createTestIndexer();
    const exitTx: Hex = `0x${'22'.repeat(32)}`;
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            post(7n),
            {
              contract: 'GuardianV2',
              event: 'Exited',
              block: { number: 101, timestamp: HOUR + 5 },
              transaction: { hash: exitTx },
              logIndex: 3,
              params: {
                owner: OWNER,
                vault: VAULT,
                verdictId: 7n,
                caller: KEEPER,
                shares: 100n,
                assets: 101n,
                remainingShares: 4n,
              },
            },
          ],
        },
      },
    });
    t.expect(await indexer.Exit.getOrThrow(`${CHAIN}-${exitTx}-3`)).toEqual({
      id: `${CHAIN}-${exitTx}-3`,
      chainId: CHAIN,
      owner: OWNER.toLowerCase(),
      vault: VAULT.toLowerCase(),
      verdict_id: `${CHAIN}-7`,
      caller: KEEPER.toLowerCase(),
      shares: 100n,
      assets: 101n,
      remainingShares: 4n,
      txHash: exitTx,
      at: BigInt(HOUR + 5),
    });
  });
});

describe('ERC4626Vault flows', () => {
  it('two Withdraws in one hour sum into one VaultFlowHour and track largestOut', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            deposit(500n, HOUR + 1, 100),
            withdraw(30n, HOUR + 10, 101),
            withdraw(70n, HOUR + 3599, 102),
            withdraw(5n, HOUR + 3600, 103), // next hour
          ],
        },
      },
    });
    const key = `${CHAIN}-${VAULT.toLowerCase()}`;
    t.expect(await indexer.VaultFlowHour.getOrThrow(`${key}-${HOUR}`)).toEqual({
      id: `${key}-${HOUR}`,
      chainId: CHAIN,
      vault: VAULT.toLowerCase(),
      hourTs: BigInt(HOUR),
      inAssets: 500n,
      outAssets: 100n,
      largestOut: 70n,
    });
    const next = await indexer.VaultFlowHour.getOrThrow(`${key}-${HOUR + 3600}`);
    t.expect({ outAssets: next.outAssets, largestOut: next.largestOut }).toEqual({ outAssets: 5n, largestOut: 5n });
  });

  it('records a LargeWithdrawal at >= 1% of the RPC baseline, not below', async (t) => {
    const indexer = createTestIndexer();
    const key = `${CHAIN}-${VAULT.toLowerCase()}`;
    indexer.VaultState.set({ id: key, chainId: CHAIN, vault: VAULT.toLowerCase(), trackedAssets: 1_000_000n, baselineFromRpc: true });
    await indexer.process({
      chains: { [CHAIN]: { simulate: [withdraw(9_999n, HOUR, 100), withdraw(9_901n, HOUR + 1, 101)] } },
    });
    // 9_999 < 1% of 1_000_000; then 9_901 >= 1% of the remaining 990_001.
    const large = await indexer.LargeWithdrawal.getAll();
    t.expect(large.map((l) => l.assets)).toEqual([9_901n]);
    t.expect(large[0]).toMatchObject({ chainId: CHAIN, vault: VAULT.toLowerCase(), owner: OWNER.toLowerCase(), at: BigInt(HOUR + 1) });
    t.expect((await indexer.VaultState.getOrThrow(key)).trackedAssets).toBe(1_000_000n - 9_999n - 9_901n);
  });

  it('with no RPC baseline, judges size against flows seen so far', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { [CHAIN]: { simulate: [withdraw(10n, HOUR, 100), deposit(1_000n, HOUR + 1, 101), withdraw(9n, HOUR + 2, 102), withdraw(10n, HOUR + 3, 103)] } },
    });
    // First withdraw has nothing to compare against and clamps tracked to 0. 9 < 1% of 1000; 10 >= 1% of 991.
    const large = await indexer.LargeWithdrawal.getAll();
    t.expect(large.map((l) => l.assets)).toEqual([10n]);
    t.expect(large[0]!.at).toBe(BigInt(HOUR + 3));
  });
});
