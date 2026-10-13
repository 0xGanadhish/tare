'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VerdictSlip } from '@/components/slip/VerdictSlip';
import { Button } from '@/components/ui/Button';
import type { Intent, Recommendation } from '@/shared/types';
import { SlipAction } from '@/components/slip/SlipAction';
import { networkLabel, useNetwork } from '@/components/network/NetworkProvider';
import { IntentChips, needsPick } from './IntentChips';
import { fitSummary } from './fit';

const EXAMPLE = '500 USDC, safe, 3 months';

/** Manual-picker intent used when the intent cannot be parsed (spec §11: chips become manual pickers). */
const blankIntent = (text: string): Intent => ({
  text,
  amount: null,
  asset: null,
  risk: { value: 'low', confidence: 0 },
  horizon: { value: 'medium', confidence: 0 },
  assetPref: { value: 'any', confidence: 0 },
});

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j;
}

export function AdvisorClient() {
  const params = useSearchParams();
  const prefill = params.get('q') ?? '';
  const [text, setText] = useState(prefill);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [protectable, setProtectable] = useState<Recommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const { network } = useNetwork();

  const advise = useCallback(async (i: Intent) => {
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ recommendations: Recommendation[]; covered?: Recommendation[] }>('/api/advise', { intent: i, network });
      if (mine === seq.current) {
        setRecs(res.recommendations.slice(0, 3));
        setProtectable(res.covered ?? []);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : 'Could not get recommendations');
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [network]);

  const submit = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const mine = ++seq.current;
      setBusy(true);
      setError(null);
      setNotice(null);
      setRecs(null);
      setProtectable([]);
      let parsed: Intent;
      try {
        parsed = await post<Intent>('/api/intent', { text: q });
      } catch {
        parsed = blankIntent(q);
        setNotice('Tare could not read that, so pick the options yourself.');
      }
      if (mine !== seq.current) return;
      setIntent(parsed);
      if (needsPick(parsed)) {
        setBusy(false);
        return;
      }
      await advise(parsed);
    },
    [advise],
  );

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefill && !prefilled.current) {
      prefilled.current = true;
      void submit(prefill);
    }
  }, [prefill, submit]);

  // The Tare vaults differ per network, so ask again when the header switch changes it.
  const shownFor = useRef(network);
  useEffect(() => {
    if (shownFor.current === network) return;
    shownFor.current = network;
    if (intent && !needsPick(intent)) void advise(intent);
  }, [network, intent, advise]);

  const onChips = (next: Intent) => {
    setIntent(next);
    if (!needsPick(next)) void advise(next);
  };

  const card = (r: Recommendation) => {
    const fit = intent ? fitSummary(r, intent, network) : null;
    return (
      <VerdictSlip
        key={r.pool.id}
        pool={r.pool}
        verdict={r.verdict}
        action={
          <div>
            {fit && (
              <div className="mb-3">
                <p className="text-[13px] text-ink">{fit.line}</p>
                <details className="group mt-1.5">
                  <summary className="mono inline-block cursor-pointer select-none list-none text-[11px] uppercase tracking-[0.06em] text-secondary hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Details ▾</span>
                    <span className="hidden group-open:inline">Hide details ▴</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-[12px] leading-snug text-secondary">
                    {fit.details.map((d) => (
                      <li key={d} className="flex gap-2">
                        <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink/30" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
            <SlipAction pool={r.pool} defaultAmount={intent?.amount} note={false} />
          </div>
        }
      />
    );
  };

  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Advisor</h1>
      <p className="mt-1 text-[14px] text-secondary">Say what you want in plain words. Tare reads it, then ranks the pools that fit.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
        className="mt-6 flex max-w-[640px] flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="intent" className="sr-only">
          What do you want to do?
        </label>
        <input
          id="intent"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          className="min-w-0 flex-1 rounded-full border border-hairline bg-white px-4 py-2.5 text-[13px] outline-none focus:border-ink/40"
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Thinking…' : 'Find yields →'}
        </Button>
      </form>
      {!intent && (
        <button onClick={() => { setText(EXAMPLE); void submit(EXAMPLE); }} className="mono mt-2 pl-4 text-[11.5px] text-muted underline decoration-hairline underline-offset-4 hover:text-ink">
          try “{EXAMPLE}”
        </button>
      )}

      {notice && <p className="mt-4 text-[12.5px] text-secondary">{notice}</p>}
      {intent && (
        <div className="mt-6">
          <IntentChips intent={intent} onChange={onChips} />
          {needsPick(intent) && <p className="mt-2 text-[12px] text-secondary">Pick the options marked “?” to see recommendations.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-avoid/40 bg-white p-4 text-[13px] text-avoid">
          {error}
        </p>
      )}
      {recs && recs.length === 0 && <p className="mt-8 text-[13px] text-muted">No pool fits this intent. Try a wider risk or asset choice.</p>}
      {recs && recs.length > 0 && (
        <section className="mt-8">
          <h2 className="mono mb-3 text-[10.5px] uppercase tracking-[0.06em] text-muted">Top {recs.length} for you</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {recs.map(card)}
          </div>
        </section>
      )}
      {recs && protectable.length > 0 && (
        <section className="mt-10">
          <h2 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Deposit with Guardian on {networkLabel(network)}</h2>
          <p className="mb-3 mt-1 max-w-[640px] text-[12.5px] text-secondary">
            The vaults Tare watches here, so Guardian can take you out on an EXIT verdict. Listed apart from the top picks above.
          </p>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{protectable.map(card)}</div>
        </section>
      )}
    </div>
  );
}
