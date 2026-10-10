'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

interface Sample { at: number; floor: bigint; price: bigint }

export function FloorChart({ floor, price, updatedAt, decimals, symbol }: { floor: bigint; price: bigint; updatedAt: number; decimals: number; symbol: string }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => {
    if (!updatedAt) return;
    setSamples((previous) => {
      if (previous.at(-1)?.at === updatedAt) return previous;
      return [...previous.slice(-59), { at: updatedAt, floor, price }];
    });
  }, [floor, price, updatedAt]);
  const values = samples.flatMap((sample) => [sample.floor, sample.price]);
  const low = values.reduce((min, value) => value < min ? value : min, values[0] ?? 0n);
  const high = values.reduce((max, value) => value > max ? value : max, values[0] ?? 0n);
  const span = high - low || 1n;
  const start = samples[0]?.at ?? updatedAt;
  const duration = Math.max(1, (samples.at(-1)?.at ?? updatedAt) - start);
  const floorPoints = samples.map((sample) => `${24 + (sample.at - start) / duration * 552},${156 - Number((sample.floor - low) * 12000n / span) / 100}`).join(' ');
  const pricePoints = samples.map((sample) => `${24 + (sample.at - start) / duration * 552},${156 - Number((sample.price - low) * 12000n / span) / 100}`).join(' ');

  return (
    <figure className="mt-8 border-y border-hairline py-5">
      <figcaption className="flex flex-wrap justify-between gap-3 text-xs text-secondary">
        <span className="mono uppercase tracking-wider">Floor / curve price</span>
        <span className="mono text-[10px]">Live observations · 2s cadence · {symbol} per token</span>
      </figcaption>
      <svg viewBox="0 0 600 190" role="img" aria-label="Observed reserve floor and bonding curve price over time" className="mt-3 w-full">
        {[36, 96, 156].map((y) => <line key={y} x1="24" x2="576" y1={y} y2={y} stroke="var(--hairline)" strokeWidth="1" />)}
        <polyline points={pricePoints} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <polyline points={floorPoints} fill="none" stroke="var(--deposit)" strokeWidth="1.5" />
        {samples.length === 1 && <><circle cx="24" cy={156 - Number((price - low) * 12000n / span) / 100} r="3" fill="var(--ink)" /><circle cx="24" cy={156 - Number((floor - low) * 12000n / span) / 100} r="3" fill="var(--deposit)" /></>}
        <text x="24" y="180" fill="var(--muted)" fontSize="10" className="mono">{samples.length < 2 ? 'Collecting live samples…' : `${Math.round(duration / 1000)}s of observed history`}</text>
      </svg>
      <div className="mono flex flex-wrap gap-x-6 gap-y-2 text-[11px]"><span className="text-deposit">— Floor {formatUnits(floor, decimals)}</span><span>— Price {formatUnits(price, decimals)}</span></div>
      <p className="mt-3 text-xs leading-relaxed text-secondary">The floor measures backing, not a guaranteed sell quote. Yield can raise it; trades change supply and backing. No historical data is invented.</p>
    </figure>
  );
}
