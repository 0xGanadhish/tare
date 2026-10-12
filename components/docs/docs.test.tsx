// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const nav = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ notFound: nav.notFound }));

import { DOC_TOPICS } from './topics';
import { API_ROUTES, GUARDIAN } from './articles';
import { FRESHNESS_MINUTES, MAX_CONFIDENCE_PCT, MIN_CONFIDENCE_PCT } from '@/components/advisor/ProtectStep';
import { PUBLIC_ROUTES } from '@/backend/src/root';
import DocsHub from '@/app/(app)/app/docs/page';
import TopicPage, { generateStaticParams } from '@/app/(app)/app/docs/[topic]/page';

afterEach(cleanup);

const topicPage = async (topic: string) => render(await TopicPage({ params: Promise.resolve({ topic }) }));

describe('/app/docs', () => {
  test('the hub renders and links every topic', () => {
    render(<DocsHub />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/plain words/i);
    for (const t of DOC_TOPICS) {
      expect(document.querySelector(`a[href="/app/docs/${t.slug}"]`), t.slug).toBeTruthy();
    }
  });

  test('covers every section the protocol needs', () => {
    expect(DOC_TOPICS.map((t) => t.slug)).toEqual([
      'what-is-tare', 'explore', 'pulse', 'scan', 'advisor', 'watch', 'guardian', 'ledger', 'networks', 'api', 'risks',
    ]);
  });

  test('every topic page renders its title, a sidebar and a next link', async () => {
    expect((await generateStaticParams()).length).toBe(DOC_TOPICS.length);
    for (const [i, t] of DOC_TOPICS.entries()) {
      await topicPage(t.slug);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.title);
      const sidebar = screen.getByRole('navigation', { name: 'Docs' });
      expect(within(sidebar).getByRole('link', { name: t.title }).getAttribute('aria-current')).toBe('page');
      const next = DOC_TOPICS[i + 1];
      if (next) expect(screen.getByRole('link', { name: new RegExp(`Next.*${next.title}`) })).toBeTruthy();
      cleanup();
    }
  });

  test('Guardian page states the rule in plain words', async () => {
    await topicPage('guardian');
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/anyone can/i);
    expect(text).toMatch(/never holds/i);
    expect(text).toContain('80–99%');
  });

  test('Ledger page links the public state archive', async () => {
    await topicPage('ledger');
    expect(document.body.textContent).toContain('https://ledger.tarefi.xyz/state/{stateHash}.json');
    expect(document.body.textContent).toMatch(/Brier/);
  });

  test('numbers copied into the docs match the code they describe', () => {
    expect(API_ROUTES.map(([r]) => r)).toEqual([...PUBLIC_ROUTES]);
    expect([GUARDIAN.minPct, GUARDIAN.maxPct]).toEqual([MIN_CONFIDENCE_PCT, MAX_CONFIDENCE_PCT]);
    expect([...GUARDIAN.freshness]).toEqual([...FRESHNESS_MINUTES]);
  });

  test('an unknown topic is a 404', async () => {
    await expect(TopicPage({ params: Promise.resolve({ topic: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
