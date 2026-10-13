'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { monadTestnet } from '@/shared/chains';
import { abis, addresses } from '@/shared/contracts';
import { Button } from '@/components/ui/Button';
import { shortHash, txUrl } from '@/components/tx/explorer';
import type { MirrorInfo } from '@/shared/types';
import { HowJevDecides } from '@/components/admin/HowJevDecides';

/** One-click scenarios for the demo. Stress clears Jev's exit bar (94–95% in testing) and leaves enough liquidity to get fully out. */
const SCENARIOS = [
  { label: 'Calm', apy: 650, util: 7100, note: 'Normal market. Expect a HOLD verdict.' },
  { label: 'Stress', apy: 50, util: 9500, note: 'Yield collapses, liquidity dries up. Expect an EXIT verdict.' },
  { label: 'Locked', apy: 50, util: 10000, note: 'Nothing can be withdrawn. Anyone still in is stuck.' },
] as const;

const TOKEN_KEY = 'tare-admin-token';

export function AdminPanel() {
  const [token, setToken] = useState('');
  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(TOKEN_KEY) ?? '');
    } catch {}
  }, []);
  const save = (v: string) => {
    setToken(v);
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
    } catch {}
  };
  const mirrors = addresses.mirrors ?? [];
  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Demo controls</h1>
      <p className="mt-1 max-w-[680px] text-[14px] leading-relaxed text-secondary">
        Each card is a testnet mirror of a real Monad vault. Here you play the market: push a vault into trouble and watch Tare and Guardian react on{' '}
        <a href="/app/watch" className="text-ink underline decoration-hairline underline-offset-4">Watch</a>. How it decides is{' '}
        <a href="#how" className="text-ink underline decoration-hairline underline-offset-4">explained below</a>.
      </p>
      <label className="mt-6 block max-w-[420px] text-[12px] text-secondary">
        Admin token (kept in this tab only)
        <input
          type="password"
          value={token}
          onChange={(e) => save(e.target.value)}
          autoComplete="off"
          className="mono mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40"
        />
      </label>
      {mirrors.length === 0 && <p className="mt-8 text-[13px] text-muted">No mirror vaults in the testnet deployment yet.</p>}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {mirrors.map((m) => (
          <MirrorControl key={m.address} mirror={m} token={token} />
        ))}
      </div>
      <HowJevDecides />
    </div>
  );
}

type Result = { ok: true; txHash: string; seconds: number } | { ok: false; error: string };

function MirrorControl({ mirror, token }: { mirror: MirrorInfo; token: string }) {
  const base = { address: mirror.address, abi: abis.mirrorVault, chainId: monadTestnet.id, query: { refetchInterval: 4000 } } as const;
  const apyChain = useReadContract({ ...base, functionName: 'apyBps' }).data;
  const utilChain = useReadContract({ ...base, functionName: 'utilizationBps' }).data;
  const total = useReadContract({ ...base, functionName: 'totalAssets' }).data;
  const [apy, setApy] = useState<number | null>(null);
  const [util, setUtil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const apyVal = apy ?? (apyChain !== undefined ? Number(apyChain) : 500);
  const utilVal = util ?? (utilChain !== undefined ? Number(utilChain) : 7000);

  const apply = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ vault: mirror.address, apyBps: apyVal, utilBps: utilVal }),
      });
      const j = (await r.json().catch(() => ({}))) as { txHash?: string; seconds?: number; error?: string };
      if (!r.ok || !j.txHash) throw new Error(j.error ?? `Request failed (${r.status})`);
      setResult({ ok: true, txHash: j.txHash, seconds: j.seconds ?? 0 });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-[14px] bg-paper p-5 shadow-[0_20px_40px_-24px_rgba(32,0,82,0.25),0_4px_10px_-6px_rgba(32,0,82,0.15)]">
      <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{mirror.mirrorOf}</h2>
      <p className="mono mt-0.5 break-all text-[10.5px] text-muted">{mirror.address}</p>
      <p className="mono mt-3 text-[11px] text-muted">
        On chain now: APY {apyChain !== undefined ? `${(Number(apyChain) / 100).toFixed(2)}%` : '–'} · utilization {utilChain !== undefined ? `${Number(utilChain) / 100}%` : '–'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIOS.map((sc) => {
          const on = apyVal === sc.apy && utilVal === sc.util;
          return (
            <button
              key={sc.label}
              title={sc.note}
              onClick={() => { setApy(sc.apy); setUtil(sc.util); }}
              className={`rounded-full border px-3 py-1 text-[12px] transition ${on ? 'border-ink bg-ink text-white' : 'border-hairline bg-white text-secondary hover:border-ink/40'}`}
            >
              {sc.label} · {sc.util / 100}% / {sc.apy / 100}%
            </button>
          );
        })}
      </div>
      <Slider label="APY (what the vault pays per year)" value={apyVal} max={3000} step={50} onChange={setApy} fmt={(v) => `${(v / 100).toFixed(2)}%`} />
      <Slider label="Utilization (share of the vault lent out)" value={utilVal} max={10000} step={100} onChange={setUtil} fmt={(v) => `${(v / 100).toFixed(0)}%`} />
      <p className="mt-2 text-[12px] text-secondary">
        {SCENARIOS.find((sc) => sc.apy === apyVal && sc.util === utilVal)?.note ?? 'Custom numbers.'}{' '}
        {total !== undefined && (
          <>At {(utilVal / 100).toFixed(0)}% utilization, <span className="mono text-ink">{Math.floor((Number(total) * (10_000 - utilVal)) / 10_000 / 1e6).toLocaleString('en-US')} USDC</span> of this vault&apos;s {Math.floor(Number(total) / 1e6).toLocaleString('en-US')} can be withdrawn.</>
        )}
      </p>
      <div className="mt-4">
        <Button onClick={apply} disabled={busy || !token} className="w-full sm:w-auto">
          {busy ? 'Signing & confirming…' : 'Apply'}
        </Button>
        {!token && <p className="mt-2 text-[11.5px] text-muted">Enter the admin token first.</p>}
        {result?.ok && (
          <p role="status" className="mono mt-2 text-[11.5px]">
            Confirmed in {result.seconds.toFixed(1)}s ·{' '}
            <a href={txUrl(result.txHash)} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4">
              {shortHash(result.txHash)} ↗
            </a>
          </p>
        )}
        {result && !result.ok && (
          <p role="alert" className="mono mt-2 text-[11.5px] text-avoid">
            Failed: {result.error}
          </p>
        )}
      </div>
    </article>
  );
}

function Slider({ label, value, max, step, onChange, fmt }: { label: string; value: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="mt-4 block text-[12px] text-secondary">
      <span className="flex justify-between">
        {label}
        <span className="mono tabular-nums text-ink">{fmt(value)}</span>
      </span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--deposit)]" />
    </label>
  );
}
