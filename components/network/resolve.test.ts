import { describe, expect, test } from 'vitest';
import { resolveNetwork } from './resolve';

describe('resolveNetwork', () => {
  test('URL param wins over storage', () => {
    expect(resolveNetwork('mainnet', 'testnet')).toBe('mainnet');
  });
  test('storage is used when there is no URL param', () => {
    expect(resolveNetwork(null, 'mainnet')).toBe('mainnet');
  });
  test('an invalid URL param falls through to storage, then testnet', () => {
    expect(resolveNetwork('bogus', null)).toBe('testnet');
    expect(resolveNetwork('bogus', 'mainnet')).toBe('mainnet');
  });
  test('defaults to testnet', () => {
    expect(resolveNetwork(null, null)).toBe('testnet');
    expect(resolveNetwork(null, 'junk')).toBe('testnet');
  });
});
