import { beforeEach, expect, test, vi } from 'vitest';
import { NETWORKS, UNDEPLOYED, type NetworkConfig, type VaultConfig } from '../shared/networks';
import { readPositions, type PositionDeps } from './positions';

const owner = '0x1111111111111111111111111111111111111111';
const vaultA: VaultConfig = { address: '0x2222222222222222222222222222222222222222', name: 'Vault A', poolId: 'a', protocol: 'euler', adapter: null };
const vaultB: VaultConfig = { address: '0x4444444444444444444444444444444444444444', name: 'Vault B', poolId: 'b', protocol: 'morpho', adapter: null };
const guardian = '0x3333333333333333333333333333333333333333';
const oracle = '0x5555555555555555555555555555555555555555';
const stateHash = `0x${'ab'.repeat(32)}` as const;
const txHash = `0x${'cd'.repeat(32)}` as const;

const config = (over: Partial<NetworkConfig> = {}): NetworkConfig => ({ ...NETWORKS.testnet, vaults: [vaultA, vaultB], guardian, oracle, ...over });

let readContract: ReturnType<typeof vi.fn>;
let latest: ReturnType<typeof vi.fn>;
let deps: PositionDeps;

beforeEach(() => {
  readContract = vi.fn(async ({ address, functionName }: { address: string; functionName: string }) => {
    if (functionName === 'balanceOf') return address === vaultA.address ? 5_000_000n : 0n;
    if (functionName === 'convertToAssets') return 5_100_000n;
    if (functionName === 'rules') return [true, 9000, 600, 1_760_000_000n];
    if (functionName === 'latest') return 7n;
    if (functionName === 'getPost') return { vault: vaultA.address, verdict: 1, confidenceBps: 9300, riskBps: 8800, stateHash, postedAt: 1_760_000_100n, ppsAtPost: 0n, assetsAtPost: 0n, liquidityAtPost: 0n };
    throw new Error(`unexpected ${functionName}`);
  });
  latest = vi.fn(async () => ({ id: 7, txHash }));
  deps = { config: config(), client: { readContract } as unknown as PositionDeps['client'], backend: { latest } as unknown as PositionDeps['backend'], stateBaseUrl: 'https://state.example' };
});

test('rejects an invalid owner before any RPC', async () => {
  await expect(readPositions('testnet', '0x123' as `0x${string}`, deps)).rejects.toThrow('Not a valid Monad address');
  expect(readContract).not.toHaveBeenCalled();
});

test('readPositions skips vaults with zero shares', async () => {
  const positions = await readPositions('testnet', owner, deps);
  expect(positions.map((p) => p.vault.address)).toEqual([vaultA.address]);
});

test('readPositions attaches the rule and latest verdict', async () => {
  const [p] = await readPositions('testnet', owner, deps);
  expect(p).toEqual({
    vault: vaultA, shares: 5_000_000n, assets: 5_100_000n,
    rule: { enabled: true, minConfidenceBps: 9000, maxAge: 600 },
    latest: { id: '7', verdict: 'EXIT', confidenceBps: 9300, postedAt: 1_760_000_100, txHash, stateUrl: `https://state.example/state/${stateHash}.json` },
  });
  expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ address: guardian, functionName: 'rules', args: [owner, vaultA.address] }));
});

test('no Guardian or oracle deployed → rule and latest are null, no calls to them', async () => {
  deps.config = config({ guardian: UNDEPLOYED, oracle: UNDEPLOYED });
  const [p] = await readPositions('testnet', owner, deps);
  expect(p.rule).toBeNull();
  expect(p.latest).toBeNull();
  expect(readContract.mock.calls.map(([c]) => c.functionName)).not.toContain('rules');
});

test('a vault with no post yet has latest null', async () => {
  readContract.mockImplementation(async ({ address, functionName }: { address: string; functionName: string }) =>
    ({ balanceOf: address === vaultA.address ? 1n : 0n, convertToAssets: 1n, rules: [false, 0, 0, 0n], latest: 0n } as Record<string, unknown>)[functionName]);
  const [p] = await readPositions('testnet', owner, deps);
  expect(p.latest).toBeNull();
  expect(p.rule).toEqual({ enabled: false, minConfidenceBps: 0, maxAge: 0 });
});

test('backend down still returns the onchain verdict, without a tx hash', async () => {
  latest.mockRejectedValue(new Error('down'));
  const [p] = await readPositions('testnet', owner, deps);
  expect(p.latest).toMatchObject({ id: '7', verdict: 'EXIT', txHash: null });
});
