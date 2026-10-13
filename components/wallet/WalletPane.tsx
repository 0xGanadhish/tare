'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useBalance, useDisconnect, useReadContract, useReadContracts } from 'wagmi';
import { abis, addresses } from '@/shared/contracts';
import { monadTestnet } from '@/shared/chains';
import { UNDEPLOYED, type Network, type NetworkConfig } from '@/shared/networks';
import type { Address } from '@/shared/types';
import { fromJson, type PositionV2Json } from '@/lib/positionTypes';
import { networkLabel, useNetwork } from '@/components/network/NetworkProvider';
import { addressUrl, shortHash, txUrl } from '@/components/tx/explorer';
import { TITLE, TONE } from '@/components/watch/EventFeed';
import type { FeedEvent } from '@/components/watch/feed';
import { Button } from '@/components/ui/Button';
import { activeRules, fmtUnits, myLaunches, recentActivity, usdcLabel, type Launch } from './pane';

const USDC_DECIMALS = 6;
const ACTIVITY_ROWS = 6;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PROTOCOL: Record<string, string> = { mirror: 'Testnet mirror', euler: 'Euler', morpho: 'Morpho' };

export interface WalletPaneProps { address: Address; open: boolean; onClose(): void }

/** Right-hand wallet pane for the selected network: balances, Tare positions, Guardian rules, Tare activity, launched tokens (testnet). */
export function WalletPane({ open, ...rest }: WalletPaneProps) {
  if (!open) return null;
  // Portal out of the sticky header: its backdrop-blur makes it the containing block for `fixed` children.
  return createPortal(<Pane {...rest} />, document.body);
}

function Pane({ address, onClose }: Omit<WalletPaneProps, 'open'>) {
  const { network, config } = useNetwork();
  const { disconnect } = useDisconnect();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  // Focus in on open, trap Tab inside, Escape closes, focus returns to the trigger on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous !== document.body && previous.isConnected) previous.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="fixed inset-0 z-40">
      <button data-testid="wallet-pane-backdrop" tabIndex={-1} aria-hidden className="absolute inset-0 cursor-default bg-ink/25" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-pane-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto overflow-x-hidden bg-bg p-4 shadow-[0_0_60px_-20px_rgba(32,0,82,0.35)] sm:w-[400px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="wallet-pane-title" className="text-[19px] font-semibold tracking-[-0.02em]">Wallet</h2>
            <p className="mono mt-0.5 text-[10.5px] uppercase tracking-[0.06em] text-muted">{networkLabel(network)}</p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close wallet"
            className="mono shrink-0 text-[11px] uppercase tracking-[0.06em] text-secondary hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        <p className="mono mt-4 break-all rounded-xl border border-hairline bg-paper px-3 py-2.5 text-[12px] text-ink">{address}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {});
            }}
          >
            {copied ? 'Copied ✓' : 'Copy address'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              disconnect();
              onClose();
            }}
          >
            Disconnect
          </Button>
        </div>

        <Balances address={address} network={network} config={config} />
        <Positions address={address} network={network} />
        <GuardianRules address={address} network={network} config={config} />
        <Activity address={address} network={network} config={config} />
        {config.features.launch && addresses.launchFactory && <LaunchedTokens address={address} factory={addresses.launchFactory} />}
      </div>
    </div>
  );
}

function Section({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-label={label} className="mt-6 border-t border-hairline pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-muted">{children}</p>;

function Balances({ address, network, config }: { address: Address; network: Network; config: NetworkConfig }) {
  const mon = useBalance({ address, chainId: config.chain.id });
  const usdc = useReadContract({
    address: config.usdc, abi: abis.mockToken, functionName: 'balanceOf', args: [address], chainId: config.chain.id,
    query: { enabled: config.usdc !== UNDEPLOYED },
  });
  return (
    <Section label="Balances">
      <dl className="grid grid-cols-2 gap-3">
        <Amount label="MON" value={mon.data ? fmtUnits(mon.data.value, mon.data.decimals, 4) : '–'} />
        <Amount label={usdcLabel(network)} value={fmtUnits(usdc.data, USDC_DECIMALS)} />
      </dl>
    </Section>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-3 py-2.5">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="mono mt-0.5 truncate text-[17px] tabular-nums">{value}</dd>
    </div>
  );
}

function Positions({ address, network }: { address: Address; network: Network }) {
  const q = useQuery({
    queryKey: ['wallet-pane', 'positions', network, address],
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/positions/${address}?network=${network}`);
      if (!r.ok) throw new Error(`Positions unavailable (${r.status})`);
      return ((await r.json()) as { positions: PositionV2Json[] }).positions.map(fromJson);
    },
  });
  return (
    <Section label="Positions">
      {q.isPending && <Muted>Reading your positions…</Muted>}
      {q.isError && <p role="alert" className="text-[12.5px] text-avoid">{q.error.message}</p>}
      {q.data?.length === 0 && (
        <Muted>
          No Tare positions on this network.{' '}
          <Link href={`/app/advisor?network=${network}`} className="text-ink underline decoration-hairline underline-offset-4">Deposit via the Advisor</Link>
        </Muted>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-hairline/70">
          {q.data.map((p) => (
            <li key={p.vault.address} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{p.vault.name}</p>
                <p className="mono text-[10.5px] uppercase tracking-[0.04em] text-muted">{PROTOCOL[p.vault.protocol] ?? p.vault.protocol}</p>
              </div>
              <p className="mono shrink-0 text-[13px] tabular-nums">
                <span>{fmtUnits(p.assets, USDC_DECIMALS)}</span> <span className="text-[11px] text-muted">{usdcLabel(network)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function GuardianRules({ address, network, config }: { address: Address; network: Network; config: NetworkConfig }) {
  const deployed = config.guardian !== UNDEPLOYED;
  const reads = useReadContracts({
    contracts: config.vaults.map((v) => ({
      address: config.guardian, abi: abis.guardianV2, functionName: 'rules', args: [address, v.address], chainId: config.chain.id,
    }) as const),
    query: { enabled: deployed && config.vaults.length > 0, refetchInterval: 15_000 },
  });
  const rules = activeRules(config.vaults, reads.data);
  return (
    <Section label="Guardian rules">
      {!deployed ? (
        <Muted>Guardian is not deployed on this network yet.</Muted>
      ) : !reads.data ? (
        <Muted>Reading your rules…</Muted>
      ) : rules.length === 0 ? (
        <Muted>
          No Guardian rules on.{' '}
          <Link href={`/app/watch?network=${network}`} className="text-ink underline decoration-hairline underline-offset-4">Turn one on from Watch</Link>
        </Muted>
      ) : (
        <ul className="divide-y divide-hairline/70">
          {rules.map((r) => (
            <li key={r.vault.address}>
              <Link href={`/app/watch?network=${network}`} className="group flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium group-hover:underline group-hover:underline-offset-4">{r.vault.name}</span>
                  <span className="mono block text-[11px] text-secondary">
                    Exit at ≥{Math.round(r.minConfidenceBps / 100)}% · verdicts ≤{Math.round(r.maxAge / 60)} min old
                  </span>
                </span>
                <span className="mono shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-deposit">● On</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Activity({ address, network, config }: { address: Address; network: Network; config: NetworkConfig }) {
  const q = useQuery({
    queryKey: ['wallet-pane', 'events', network, address],
    refetchInterval: 10_000,
    queryFn: async (): Promise<FeedEvent[]> => {
      const r = await fetch(`/api/watch/events?network=${network}&owner=${address}`);
      if (!r.ok) throw new Error(`Activity unavailable (${r.status})`);
      return ((await r.json()) as { events: FeedEvent[] }).events;
    },
  });
  const events = recentActivity(q.data ?? [], ACTIVITY_ROWS);
  const vaultName = (v: string) => config.vaults.find((x) => x.address.toLowerCase() === v.toLowerCase())?.name;
  return (
    <Section
      label="Tare activity"
      aside={<Link href={`/app/watch?network=${network}`} className="mono text-[10.5px] text-secondary underline decoration-hairline underline-offset-4 hover:text-ink">Live feed</Link>}
    >
      {q.isPending && <Muted>Reading activity…</Muted>}
      {q.isError && <p role="alert" className="text-[12.5px] text-avoid">{q.error.message}</p>}
      {q.isSuccess && events.length === 0 && <Muted>No Tare activity yet. Verdict alerts and Guardian exits for your positions show up here.</Muted>}
      {events.length > 0 && (
        <ol className="divide-y divide-hairline/70">
          {events.map((e) => (
            <li key={e.id} className="py-2.5 text-[12.5px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`mono text-[11px] font-medium uppercase tracking-[0.04em] ${TONE[e.type] ?? 'text-secondary'}`}>{TITLE[e.type] ?? e.type}</span>
                <span className="mono shrink-0 text-[10.5px] text-muted">
                  {new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-secondary">
                {vaultName(e.vault) ? `${vaultName(e.vault)} · ` : ''}
                {e.message}
              </p>
              {e.txHash && (
                <a href={txUrl(e.txHash, network)} target="_blank" rel="noopener noreferrer" className="mono text-[11px] underline decoration-hairline underline-offset-4 hover:decoration-ink">
                  {shortHash(e.txHash)} ↗
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
      <a
        href={addressUrl(address, network)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono mt-3 inline-block text-[11.5px] text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
      >
        View all on MonadVision ↗
      </a>
    </Section>
  );
}

/** Testnet only: the caller renders this only when `config.features.launch` is on. */
function LaunchedTokens({ address, factory }: { address: Address; factory: Address }) {
  const q = useReadContract({ address: factory, abi: abis.launchFactory, functionName: 'launches', chainId: monadTestnet.id });
  const mine = myLaunches(q.data as readonly Launch[] | undefined, address);
  return (
    <Section label="Launched tokens">
      {q.isError ? (
        <p role="alert" className="text-[12.5px] text-avoid">Could not read launched tokens.</p>
      ) : !q.data ? (
        <Muted>Reading launched tokens…</Muted>
      ) : mine.length === 0 ? (
        <Muted>
          You have not launched a token.{' '}
          <Link href="/app/launch?network=testnet" className="text-ink underline decoration-hairline underline-offset-4">Launch one</Link>
        </Muted>
      ) : (
        <ul className="divide-y divide-hairline/70">
          {mine.map((l) => (
            <li key={l.token}>
              <Link href={`/app/launch/${l.token}?network=testnet`} className="group flex items-baseline justify-between gap-3 py-2.5">
                <span className="truncate text-[13px] font-medium group-hover:underline group-hover:underline-offset-4">{l.name}</span>
                <span className="mono shrink-0 text-[11px] uppercase tracking-wider text-muted">{l.symbol} ↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
