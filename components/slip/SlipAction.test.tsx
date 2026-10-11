// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { NETWORKS, type Network } from '@/shared/networks';
import type { Pool } from '@/shared/types';

const net = vi.hoisted(() => ({ network: 'testnet' as Network, mounts: 0 }));
const vault = { address: '0x2222222222222222222222222222222222222222', name: 'V', poolId: 'p1', protocol: 'euler', adapter: null } as const;
vi.mock('@/components/network/NetworkProvider', () => ({ useNetwork: () => ({ network: net.network, config: NETWORKS[net.network] }) }));
vi.mock('./slipAction', () => ({ slipAction: () => ({ kind: 'deposit', vault }) }));
vi.mock('@/components/advisor/DepositFlow', () => ({
  DepositFlow: () => { useEffect(() => { net.mounts += 1; }, []); return null; },
}));
import { SlipAction } from './SlipAction';

afterEach(cleanup);

test('switching network remounts the deposit flow so no step state carries over', () => {
  const pool = { id: 'p1', project: 'euler' } as Pool;
  const { rerender } = render(<SlipAction pool={pool} />);
  net.network = 'mainnet';
  rerender(<SlipAction pool={pool} />);
  expect(net.mounts).toBe(2);
});
