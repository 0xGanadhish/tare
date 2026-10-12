'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { NETWORK_IDS, NETWORKS, type Network } from '@/shared/networks';
import type { LedgerScore } from '@/shared/score';
import type { LedgerVerdict } from '@/lib/backend';
import { LedgerTable } from '@/components/ledger/LedgerTable';
import { Scoreboard } from '@/components/ledger/Scoreboard';
import { verdictLabel } from '@/components/ledger/format';
import { useNetwork } from '@/components/network/NetworkProvider';
import { Select } from '@/components/ui/Select';

type Page = { verdicts: LedgerVerdict[]; cursor: string | null; source: 'fixtures' | 'backend' };
const STATE_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || null;
const VERDICTS = ['all', 'HOLD', 'EXIT', 'MOVE'] as const;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 503 ? 'The ledger is not reachable right now.' : `Ledger request failed (${r.status})`);
  return (await r.json()) as T;
}

export default function LedgerPage() {
  const app = useNetwork();
  const [network, setNetwork] = useState<Network>(app.network);
  const [vault, setVault] = useState('');
  const [verdict, setVerdict] = useState<(typeof VERDICTS)[number]>('all');
  // Follow the header switch; the page filter can still look at the other network.
  useEffect(() => { setNetwork(app.network); setVault(''); }, [app.network]);

  const pages = useInfiniteQuery({
    queryKey: ['ledger', network, vault],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      getJson<Page>(`/api/ledger/verdicts?network=${network}${vault ? `&vault=${vault}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}&limit=50`),
    getNextPageParam: (last) => last.cursor ?? undefined,
    refetchInterval: 15_000,
  });
  const score = useQuery({
    queryKey: ['ledger-score', network],
    queryFn: () => getJson<{ score: LedgerScore; source: Page['source'] }>(`/api/ledger/score?network=${network}`),
    refetchInterval: 30_000,
  });

  const rows = useMemo(
    () => (pages.data?.pages ?? []).flatMap((p) => p.verdicts).filter((r) => verdict === 'all' || verdictLabel(r.verdict) === verdict),
    [pages.data, verdict],
  );
  const sample = pages.data?.pages[0]?.source === 'fixtures';
  const select = 'mono rounded-lg border border-hairline bg-white py-1.5 pl-2.5 text-[12px]';

  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Ledger</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-secondary">
        Every verdict Tare posts onchain, and how it turned out. The oracle grades each one itself after a fixed window, so this record
        cannot be edited after the fact.
      </p>
      {sample && (
        <p role="note" className="mt-4 rounded-xl border border-dashed border-hairline p-3 text-[12.5px] text-secondary">
          Sample data: this is an offline run (fixtures), so the rows below are examples, not real verdicts.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-2 text-secondary">
          Network
          <Select className={select} value={network} onChange={(e) => { setNetwork(e.target.value as Network); setVault(''); }}>
            {NETWORK_IDS.map((n) => <option key={n} value={n}>{n === 'mainnet' ? 'Mainnet' : 'Testnet'}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-secondary">
          Vault
          <Select className={select} value={vault} onChange={(e) => setVault(e.target.value)}>
            <option value="">All vaults</option>
            {NETWORKS[network].vaults.map((v) => <option key={v.address} value={v.address}>{v.name}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-secondary">
          Verdict
          <Select className={select} value={verdict} onChange={(e) => setVerdict(e.target.value as (typeof VERDICTS)[number])}>
            {VERDICTS.map((v) => <option key={v} value={v}>{v === 'all' ? 'All' : v}</option>)}
          </Select>
        </label>
      </div>

      <div className="mt-6">
        {score.data ? <Scoreboard score={score.data.score} network={network} /> : score.isError ? null : <p className="text-[13px] text-muted">Loading the scoreboard…</p>}
      </div>

      <section aria-label="Verdicts" className="mt-6">
        {pages.isError && (
          <p role="alert" className="rounded-xl border border-avoid/40 bg-white p-4 text-[13px] text-avoid">{pages.error.message}</p>
        )}
        {pages.isPending && <p className="text-[13px] text-muted">Reading the ledger…</p>}
        {pages.data && rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-hairline p-5 text-[13px] text-secondary">
            No verdicts on {network === 'mainnet' ? 'mainnet' : 'testnet'} yet{vault || verdict !== 'all' ? ' for these filters' : ''}.
          </p>
        )}
        {rows.length > 0 && <LedgerTable rows={rows} stateBase={STATE_BASE} />}
        {pages.hasNextPage && (
          <button type="button" onClick={() => void pages.fetchNextPage()} disabled={pages.isFetchingNextPage} className="mono mt-3 text-[12px] underline underline-offset-4">
            {pages.isFetchingNextPage ? 'Loading…' : 'Load older verdicts'}
          </button>
        )}
      </section>

      <Method />
    </div>
  );
}

function Method() {
  return (
    <section aria-labelledby="method" className="mt-10 max-w-[720px] text-[13px] leading-relaxed text-secondary">
      <h2 id="method" className="text-[17px] font-semibold text-ink">Method</h2>
      <p className="mt-2">
        When Tare posts a verdict, the oracle records the vault&apos;s share price, total assets and available liquidity. After the window
        (1 hour on testnet, 24 hours on mainnet) the verdict is graded <strong className="text-ink">adverse</strong> if any of these happened:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>the share price fell more than 0.5% (price drop)</li>
        <li>total assets fell more than 20% (TVL drop)</li>
        <li>available liquidity is below 5% of total assets, for vaults with a liquidity adapter (liquidity)</li>
        <li>the vault could not be read at all (vault unreadable)</li>
      </ul>
      <p className="mt-2">
        Otherwise it is <strong className="text-ink">clear</strong>. Anyone can call <code className="mono text-ink">resolve</code> on the oracle once the
        window ends, so grading does not depend on Tare.
      </p>
      <p className="mt-2">
        A verdict is right when an EXIT is followed by an adverse outcome, or a HOLD or MOVE by none. The Brier score compares each verdict&apos;s
        withdrawal-risk forecast with what happened (0 is perfect, lower is better). Drills, posted by hand to test exits, are labelled and left out of the score. Fewer than 30
        graded verdicts is early data.
      </p>
      <p className="mt-2">
        Limits: grading compares the start and the end of the window only, so a crunch that recovers inside the window is not counted. The TVL and
        liquidity grades read a single moment when <code className="mono text-ink">resolve</code> runs, so they are point-in-time; Tare resolves each
        verdict as soon as its window ends. The share-price grade is the robust one.
      </p>
    </section>
  );
}
