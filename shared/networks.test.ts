import { expect, test } from 'vitest';
import { NETWORKS, vaultForPool } from './networks';

test('mainnet hides the faucet and caps deposits in the UI', () => {
  expect(NETWORKS.mainnet.features.faucet).toBe(false);
  expect(NETWORKS.mainnet.features.softCapUsd).toBe(1000);
  expect(NETWORKS.mainnet.features.demoControls).toBe(false);
  expect(NETWORKS.mainnet.features.launch).toBe(false);
});

test('testnet keeps the demo controls, faucet and launch, with no cap', () => {
  expect(NETWORKS.testnet.features.demoControls).toBe(true);
  expect(NETWORKS.testnet.features.faucet).toBe(true);
  expect(NETWORKS.testnet.features.softCapUsd).toBeNull();
});

test('each network is wired to its own chain', () => {
  expect(NETWORKS.testnet.chain.id).toBe(10143);
  expect(NETWORKS.mainnet.chain.id).toBe(143);
  expect(NETWORKS.mainnet.usdc).toBe('0x754704Bc059F8C67012fEd69BC8A327a5aafb603');
});

test('testnet mirror vaults map from their DeFiLlama pool ids', () => {
  expect(vaultForPool('testnet', 'd711af54-e736-470f-8a22-431a23de76df')?.protocol).toBe('mirror');
  expect(vaultForPool('testnet', 'not-a-pool')).toBeNull();
});

test('mainnet never lists the mock mirror vaults as depositable', () => {
  expect(NETWORKS.mainnet.vaults.every((v) => v.protocol !== 'mirror')).toBe(true);
});
