import { describe, it, expect } from 'vitest';
import { resolveChain, renderConfig, PLACEHOLDER_ORACLE } from '../scripts/gen-config.mjs';

describe('gen-config', () => {
  it('uses v2 fields when present', () => {
    const c = resolveChain('mainnet', {
      oracle: '0xaaa',
      guardianV2: '0xbbb',
      deployBlockV2: 1234,
      vaults: [{ address: '0xccc' }],
    });
    expect(c).toEqual({ oracle: '0xaaa', guardian: '0xbbb', startBlock: 1234, vaults: ['0xccc'], missing: [] });
  });

  it('falls back to placeholders and testnet mirrors before v2 is deployed', () => {
    const c = resolveChain('testnet', { mirrors: [{ address: '0xm1' }, { address: '0xm2' }] });
    expect(c.oracle).toBe(PLACEHOLDER_ORACLE);
    expect(c.vaults).toEqual(['0xm1', '0xm2']);
    expect(c.missing).toEqual(['oracle', 'guardianV2', 'deployBlockV2', 'vaults']);
  });

  it('never indexes v1 mirrors as mainnet vaults', () => {
    expect(resolveChain('mainnet', { mirrors: [{ address: '0xm1' }] }).vaults).toEqual([]);
  });

  it('quotes addresses so YAML cannot read them as numbers', () => {
    const yaml = renderConfig([
      { network: 'testnet', id: 10143, oracle: '0x0a', guardian: '0x0b', startBlock: 5, vaults: ['0x0c'], missing: [] },
    ]);
    expect(yaml).toContain('address: "0x0a"');
    expect(yaml).toContain('- "0x0c"');
    expect(yaml).toContain('start_block: 5');
  });
});
