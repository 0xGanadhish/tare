/** Single source for navigation. Set `hidden: true` to pull an unfinished page from every nav (plan: announce only what works). */
export interface NavItem {
  label: string;
  href: string;
  hidden?: boolean;
}

export const APP_NAV: NavItem[] = [
  { label: 'Explore', href: '/app/explore' },
  { label: 'Pulse', href: '/app/pulse' },
  { label: 'Advisor', href: '/app/advisor' },
  { label: 'Watch', href: '/app/watch' },
  { label: 'Launch', href: '/app/launch' },
];

/** Landing nav omits Pulse (spec §5 mockup: Explore, Advisor, Watch, Launch). */
export const SITE_NAV: NavItem[] = APP_NAV.filter((n) => n.label !== 'Pulse');

export const visibleNav = (items: NavItem[]): NavItem[] => items.filter((n) => !n.hidden);
