import { NETWORKS, type NetworkConfig } from '@/shared/networks';

/** Single source for navigation. Set `hidden: true` to pull an unfinished page from every nav (plan: announce only what works). */
export interface NavItem {
  label: string;
  href: string;
  hidden?: boolean;
}

type Features = NetworkConfig['features'];

/** App nav for a network: Launch is testnet-only (spec §8.2 mainnet guardrails). Demo controls stay off the nav on every network. */
export function appNav(features: Features): NavItem[] {
  return [
    { label: 'Explore', href: '/app/explore' },
    { label: 'Pulse', href: '/app/pulse' },
    { label: 'Advisor', href: '/app/advisor' },
    { label: 'Watch', href: '/app/watch' },
    { label: 'Ledger', href: '/app/ledger' },
    { label: 'Launch', href: '/app/launch', hidden: !features.launch },
    { label: 'Docs', href: '/app/docs' },
  ];
}

/** Landing nav omits Pulse (spec §5 mockup). */
export const siteNav = (features: Features): NavItem[] => appNav(features).filter((n) => n.label !== 'Pulse');

/** Landing is server-rendered without a network context, so it shows the default (testnet) nav. */
export const APP_NAV: NavItem[] = appNav(NETWORKS.testnet.features);
export const SITE_NAV: NavItem[] = siteNav(NETWORKS.testnet.features);

export const visibleNav = (items: NavItem[]): NavItem[] => items.filter((n) => !n.hidden);
