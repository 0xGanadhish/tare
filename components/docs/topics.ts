/** The docs, in reading order. The hub, the sidebar and prev/next all read from this list. */
export type DocGroup = 'Start here' | 'Find' | 'Decide' | 'Protect' | 'Reference';

export interface DocTopic {
  slug: string;
  title: string;
  group: DocGroup;
  /** One plain line for the hub card and the page lead. */
  blurb: string;
  /** The app tab this topic describes, if any. */
  app?: { href: string; label: string };
  /** Shown as "New" on the hub (Guardian v2 + Verdict Ledger work). */
  isNew?: boolean;
}

export const DOC_GROUPS: DocGroup[] = ['Start here', 'Find', 'Decide', 'Protect', 'Reference'];

export const DOC_TOPICS: DocTopic[] = [
  { slug: 'what-is-tare', title: 'What is Tare', group: 'Start here', blurb: 'Weigh, choose, guard. The whole idea in one page.' },
  { slug: 'explore', title: 'Explore', group: 'Find', blurb: 'Every Monad pool on one chart, each with a verdict.', app: { href: '/app/explore', label: 'Open Explore' } },
  { slug: 'pulse', title: 'Pulse', group: 'Find', blurb: 'The whole market at a glance: real yield, where the money sits.', app: { href: '/app/pulse', label: 'Open Pulse' } },
  { slug: 'scan', title: 'Idle scan', group: 'Find', blurb: 'Paste any wallet and see what is sitting idle.', app: { href: '/app/scan', label: 'Scan a wallet' } },
  { slug: 'advisor', title: 'Advisor', group: 'Decide', blurb: 'Say what you want in plain words. Jev ranks the pools it trusts.', app: { href: '/app/advisor', label: 'Ask the Advisor' } },
  { slug: 'watch', title: 'Watch', group: 'Protect', blurb: 'Your positions, the latest verdict and a live feed of what happened.', app: { href: '/app/watch', label: 'Open Watch' } },
  { slug: 'guardian', title: 'Guardian v2', group: 'Protect', blurb: 'An exit rule you set. Anyone can trigger it, only you get paid.', app: { href: '/app/watch', label: 'Set a rule on Watch' }, isNew: true },
  { slug: 'ledger', title: 'Verdict Ledger', group: 'Protect', blurb: 'Every call Jev makes, posted onchain and graded in public.', app: { href: '/app/ledger', label: 'Open the Ledger' }, isNew: true },
  { slug: 'networks', title: 'Testnet and mainnet', group: 'Reference', blurb: 'What changes when you flip the switch in the header.' },
  { slug: 'api', title: 'Public API', group: 'Reference', blurb: 'The same data, as JSON, for anyone to read.' },
  { slug: 'risks', title: 'Risks and disclosures', group: 'Reference', blurb: 'What can still go wrong, said plainly.' },
];

export const topicBySlug = (slug: string): DocTopic | undefined => DOC_TOPICS.find((t) => t.slug === slug);

export function neighbours(slug: string): { prev: DocTopic | null; next: DocTopic | null } {
  const i = DOC_TOPICS.findIndex((t) => t.slug === slug);
  return { prev: DOC_TOPICS[i - 1] ?? null, next: i < 0 ? null : (DOC_TOPICS[i + 1] ?? null) };
}
