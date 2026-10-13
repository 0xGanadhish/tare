// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NETWORKS } from '@/shared/networks';
import { addressUrl } from '@/components/tx/explorer';
import type { Pool } from '@/shared/types';
import { MainnetStrip } from './MainnetStrip';

afterEach(cleanup);

const [clearstar, august] = NETWORKS.mainnet.vaults;
const pool = (id: string, tvlUsd: number) => ({ id, tvlUsd }) as Pool;

describe('MainnetStrip', () => {
  test('names every mainnet vault from the network config', () => {
    render(<MainnetStrip pools={[]} />);
    for (const v of NETWORKS.mainnet.vaults) expect(screen.getByText(v.name, { exact: false })).toBeTruthy();
  });

  test('sums the vaults’ TVL from the pool data it is given', () => {
    render(<MainnetStrip pools={[pool(clearstar.poolId!, 5_800_000), pool(august.poolId!, 8_100_000), pool('other', 9e9)]} />);
    expect(screen.getByText(/\$13\.9M/)).toBeTruthy();
  });

  test('hides the TVL when the vault pools are missing from the data', () => {
    render(<MainnetStrip pools={[]} />);
    expect(screen.queryByText(/TVL/)).toBeNull();
  });

  test('links the verified oracle and GuardianV2, the mainnet Ledger and the developer docs', () => {
    const { container } = render(<MainnetStrip pools={[]} />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(addressUrl(NETWORKS.mainnet.oracle, 'mainnet'));
    expect(hrefs).toContain(addressUrl(NETWORKS.mainnet.guardian, 'mainnet'));
    expect(hrefs).toContain('/app/ledger?network=mainnet');
    expect(hrefs).toContain('/app/docs#for-developers');
  });
});
