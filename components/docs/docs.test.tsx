// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const nav = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ notFound: nav.notFound }));

import { DOC_TOPICS } from './topics';
import { readFileSync } from 'node:fs';
import { API_ROUTES, CHECK_EVERY, DEV_GUIDE_URL, GUARDIAN, GUARDIAN_RULE_LIMITS, INDEXED_ENTITIES, ORACLE_GRADING, RESOLVE_WINDOW, SAMPLE_WINDOW } from './articles';
import { NETWORKS, NETWORK_IDS } from '@/shared/networks';
import { addressUrl } from '@/components/tx/explorer';
import { ALARM_MS, RESOLVE_WINDOW_S, SAMPLE_WINDOW_S } from '@/backend/src/cadence';
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
      'what-is-tare', 'explore', 'pulse', 'scan', 'advisor', 'watch', 'guardian', 'ledger', 'networks', 'risks',
      'contracts', 'build-oracle', 'build-guardian', 'api', 'run-your-own',
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

  test('Networks page lists the covered mainnet vaults and how often each is checked', async () => {
    await topicPage('networks');
    const text = document.body.textContent ?? '';
    for (const name of ['Clearstar Earn USDC', 'August USDC V2']) expect(text).toContain(name);
    expect(text).not.toContain('Hyperithm'); // left out at deploy: under the 5% cash floor (2026-10-13)
    expect(text).toContain('15 seconds');
  });

  test('Guardian page lists the five vault rules and uses Saturn as the vault it cannot protect', async () => {
    await topicPage('guardian');
    const rules = screen.getByRole('list', { name: 'Vault rules' });
    expect(within(rules).getAllByRole('listitem')).toHaveLength(5);
    expect(rules.textContent).toMatch(/\$1M/);
    expect(rules.textContent).toMatch(/1,000 USDC/);
    expect(document.body.textContent).toMatch(/Saturn USDC[^.]*curator/);
  });

  test('check intervals in the docs match the watcher', () => {
    expect(CHECK_EVERY).toEqual({ testnet: `${ALARM_MS.testnet / 1000} seconds`, mainnet: `${ALARM_MS.mainnet / 1000} seconds` });
  });

  test('Ledger page explains grading on the worst reading', async () => {
    await topicPage('ledger');
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/worst/i);
    expect(text).toContain('sample');
    expect(text).toMatch(/flash loan/i);
    expect(text).toMatch(/random moment/i); // the second, unannounced sample
  });

  test('grading windows in the docs match the resolver', () => {
    const hours = (s: number) => `${s / 3600} hour${s === 3600 ? '' : 's'}`;
    expect(RESOLVE_WINDOW).toEqual({ testnet: hours(RESOLVE_WINDOW_S.testnet), mainnet: hours(RESOLVE_WINDOW_S.mainnet) });
    expect(SAMPLE_WINDOW).toEqual({ testnet: null, mainnet: hours(SAMPLE_WINDOW_S.mainnet) });
    expect(SAMPLE_WINDOW_S.testnet).toBe(0);
  });

  test('developer topics have their own hub section, apart from Every feature', () => {
    render(<DocsHub />);
    const dev = DOC_TOPICS.filter((t) => t.group === 'Developers');
    expect(dev.map((t) => t.slug)).toEqual(['contracts', 'build-oracle', 'build-guardian', 'api', 'run-your-own']);
    const devSection = screen.getByRole('region', { name: 'For developers' });
    const features = screen.getByRole('region', { name: 'Every feature' });
    for (const t of dev) {
      expect(devSection.querySelector(`a[href="/app/docs/${t.slug}"]`), t.slug).toBeTruthy();
      expect(features.querySelector(`a[href="/app/docs/${t.slug}"]`), t.slug).toBeNull();
    }
  });

  test('Contracts page links every deployed address on both networks', async () => {
    await topicPage('contracts');
    for (const n of NETWORK_IDS) {
      const c = NETWORKS[n];
      const addrs = [c.oracle, c.guardian, ...c.vaults.map((v) => v.address), ...c.vaults.flatMap((v) => (v.adapter ? [v.adapter] : []))];
      for (const a of addrs) expect(document.querySelector(`a[href="${addressUrl(a, n)}"]`), `${n} ${a}`).toBeTruthy();
    }
  });

  test('grading numbers and Guardian limits match the Solidity source', () => {
    const oracle = readFileSync('contracts/src/TareRiskOracle.sol', 'utf8');
    const guardian = readFileSync('contracts/src/GuardianV2.sol', 'utf8');
    const k = (src: string, name: string) => Number(new RegExp(`${name} = ([0-9_]+);`).exec(src)![1].replace(/_/g, ''));
    expect(ORACLE_GRADING).toEqual({
      ppsDropBps: k(oracle, 'PPS_DROP_BPS'), tvlDropBps: k(oracle, 'TVL_DROP_BPS'), liqFloorBps: k(oracle, 'LIQ_FLOOR_BPS'),
      reasons: { pps: k(oracle, 'REASON_PPS'), tvl: k(oracle, 'REASON_TVL'), liq: k(oracle, 'REASON_LIQ'), broken: k(oracle, 'REASON_BROKEN') },
    });
    expect(GUARDIAN_RULE_LIMITS).toEqual({
      minConfidenceBps: k(guardian, 'MIN_CONFIDENCE_BPS'), maxConfidenceBps: k(guardian, 'MAX_CONFIDENCE_BPS'),
      minMaxAge: k(guardian, 'MIN_MAX_AGE'), maxMaxAge: k(guardian, 'MAX_MAX_AGE'),
    });
  });

  test('the API page names every entity the indexer exposes', async () => {
    const schema = readFileSync('indexer/schema.graphql', 'utf8');
    const types = [...schema.matchAll(/^type (\w+) \{/gm)].map((m) => m[1]).filter((t) => t !== 'VaultState');
    expect([...INDEXED_ENTITIES].sort()).toEqual(types.sort());
    await topicPage('api');
    for (const t of types) expect(document.body.textContent, t).toContain(t);
  });

  test('developer pages show their numbers and link the full reference', async () => {
    await topicPage('build-oracle');
    let text = document.body.textContent ?? '';
    expect(text).toContain('latest(vault)');
    expect(text).toContain('0.5%');
    expect(text).toContain('REASON_BROKEN');
    cleanup();
    await topicPage('build-guardian');
    text = document.body.textContent ?? '';
    expect(text).toContain('8,000–9,900');
    expect(text).toContain('60–3,600');
    cleanup();
    await topicPage('run-your-own');
    expect(document.body.textContent).toContain('DeployV2.s.sol');
    for (const slug of ['contracts', 'build-oracle', 'build-guardian', 'api', 'run-your-own']) {
      cleanup();
      await topicPage(slug);
      expect(document.querySelector(`a[href^="${DEV_GUIDE_URL}"]`), slug).toBeTruthy();
    }
  });

  test('an unknown topic is a 404', async () => {
    await expect(TopicPage({ params: Promise.resolve({ topic: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
