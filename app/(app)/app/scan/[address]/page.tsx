'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ScanForm } from '@/components/scan/ScanForm';
import { VerdictSlip } from '@/components/slip/VerdictSlip';
import { formatPct } from '@/components/field/format';
import type { IdleReport } from '@/shared/types';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; report: IdleReport };

export default function ScanPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [res, setRes] = useState<{ address: string; state: State } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/scan/${address}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Partial<IdleReport> & { error?: string };
        if (!r.ok) throw new Error(body.error ?? "Couldn't read this wallet");
        return body as IdleReport;
      })
      .then((report) => live && setRes({ address, state: { status: 'ok', report } }))
      .catch((e: unknown) =>
        live && setRes({ address, state: { status: 'error', message: e instanceof Error ? e.message : "Couldn't read this wallet" } }),
      );
    return () => {
      live = false;
    };
  }, [address]);

  const state: State = res?.address === address ? res.state : { status: 'loading' };

  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Idle report</h1>
      <p className="mono mt-1 break-all text-[12px] text-muted">{address}</p>
      <div className="mt-5">
        <ScanForm initial={address} />
      </div>

      {state.status === 'loading' && <p className="mt-10 text-[13px] text-muted">Reading the wallet on Monad mainnet…</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-8 rounded-xl border border-avoid/40 bg-white p-4 text-[13px] text-avoid">
          {state.message}
        </p>
      )}
      {state.status === 'ok' && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: IdleReport }) {
  const { holdings, suggestions } = report;
  const noMoney = holdings.every((h) => h.usd < 0.01);
  return (
    <>
      <section className="mt-10">
        {noMoney ? (
          <p className="display text-[28px] sm:text-[40px]">Nothing idle here.</p>
        ) : (
          <p className="display text-[28px] leading-[1.15] sm:text-[44px]">
            <span className="mono tabular-nums">{usd(report.idleUsd)}</span> idle · could earn{' '}
            <span className="mono tabular-nums text-deposit">{usd(report.potentialYearlyUsd)}</span> a year
          </p>
        )}
        <p className="mono mt-2 text-[10.5px] uppercase tracking-[0.06em] text-muted">
          idle = non-earning balances · potential = best DEPOSIT real APY of the same asset class
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mono mb-2 text-[10.5px] uppercase tracking-[0.06em] text-muted">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="border-b border-hairline text-left">
              <tr className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                <th className="py-2 font-normal">Token</th>
                <th className="py-2 text-right font-normal">Amount</th>
                <th className="py-2 text-right font-normal">Value</th>
                <th className="py-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol} className="border-b border-hairline/70">
                  <td className="py-2.5">{h.symbol}</td>
                  <td className="mono py-2.5 text-right tabular-nums text-secondary">{h.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                  <td className="mono py-2.5 text-right tabular-nums">{usd(h.usd)}</td>
                  <td className={`mono py-2.5 text-right text-[11px] ${h.earning ? 'text-deposit' : 'text-secondary'}`}>{h.earning ? 'earning' : 'idle'}</td>
                </tr>
              ))}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No tracked tokens found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="mt-10">
          <h2 className="mono mb-3 text-[10.5px] uppercase tracking-[0.06em] text-muted">Put it to work</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => (
              <VerdictSlip
                key={s.pool.id}
                pool={s.pool}
                verdict={s.verdict}
                action={
                  <div>
                    <p className="mb-3 text-[12.5px] text-secondary">
                      {usd(s.expectedReturnUsd)} a year at {formatPct(s.realApy, 2)} real APY.
                    </p>
                    <Link
                      href={`/app/advisor?q=${encodeURIComponent(`Put ${usd(report.idleUsd)} to work in ${s.pool.assetClass.replace('_', '/')}, safe, 6 months`)}`}
                      className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white hover:opacity-85 sm:w-auto"
                    >
                      Open in Advisor →
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
