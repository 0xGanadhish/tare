import { describe, expect, test } from 'vitest';
import { NETWORKS } from '@/shared/networks';
import { appNav, siteNav, visibleNav } from './navItems';

const labels = (items: { label: string }[]) => items.map((n) => n.label);

describe('nav per network', () => {
  test('navItems(mainnet) has no Launch or Demo controls and has Ledger', () => {
    const nav = labels(visibleNav(appNav(NETWORKS.mainnet.features)));
    expect(nav).not.toContain('Launch');
    expect(nav).not.toContain('Demo controls');
    expect(nav).toContain('Ledger');
  });
  test('testnet keeps Launch and adds Ledger', () => {
    const nav = labels(visibleNav(appNav(NETWORKS.testnet.features)));
    expect(nav).toContain('Launch');
    expect(nav).toContain('Ledger');
  });
  test('site nav omits Pulse and follows the same flags', () => {
    expect(labels(siteNav(NETWORKS.testnet.features))).not.toContain('Pulse');
    expect(labels(visibleNav(siteNav(NETWORKS.mainnet.features)))).not.toContain('Launch');
  });
  test('Docs is in the app and site nav on both networks', () => {
    for (const net of [NETWORKS.testnet, NETWORKS.mainnet]) {
      const docs = visibleNav(appNav(net.features)).find((n) => n.label === 'Docs');
      expect(docs?.href).toBe('/app/docs');
      expect(labels(visibleNav(siteNav(net.features)))).toContain('Docs');
    }
  });
});
