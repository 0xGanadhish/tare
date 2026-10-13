'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Pool, Verdict, VerdictLabel } from '@/shared/types';
import {
  ANNOTATION_FADE_MS,
  APY_MAX,
  POP_MS,
  SCAN_DURATION_MS,
  SCAN_START_MS,
  VERDICT_COLORS,
  colorForVerdict,
  fadeDelay,
  jitter,
  PAD,
  radiusForTvl,
  scanProgress,
  xForApy,
  yForTvl,
} from './scales';
import { annotationLines, formatConfidence, formatPct, formatPoolName, formatTvl } from './format';

export interface FieldChartProps {
  pools: Pool[];
  verdicts: Record<string, Verdict>;
  /** Pool ids to call out with a leader line (landing: one DEPOSIT, one AVOID). */
  annotate?: string[];
  onSelect?: (poolId: string) => void;
  /** Play the Weigh-in once on mount (landing true, Explore false). Respects prefers-reduced-motion. */
  animate?: boolean;
  className?: string;
}

interface Dot {
  pool: Pool;
  i: number;
  label: VerdictLabel;
  confidence: number;
  cx: number;
  cy: number;
  r: number;
}

const TVL_TICKS: [number, string][] = [
  [1e6, '$1M'],
  [1e7, '$10M'],
  [1e8, '$100M'],
];
const DOT_FILL_OPACITY = 0.9;

const round2 = (n: number) => Math.round(n * 100) / 100;

function chartHeight(w: number): number {
  return w < 560 ? 300 : Math.round(Math.min(380, Math.max(260, w * 0.33)));
}

export function FieldChart({ pools, verdicts, annotate = [], onSelect, animate = false, className }: FieldChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scanRef = useRef<SVGLineElement>(null);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const noteRefs = useRef<(SVGGElement | null)[]>([]);
  const [w, setW] = useState(1000);
  const [pre, setPre] = useState(animate);
  const [hover, setHover] = useState<number | null>(null);
  const wRef = useRef(w);
  wRef.current = w;
  const h = chartHeight(w);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setW(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dots: Dot[] = useMemo(
    () =>
      pools.map((pool, i) => {
        const v = verdicts[pool.id];
        const x = xForApy(pool.apy, w) + jitter(i);
        return {
          pool,
          i,
          label: v?.label ?? 'NOT_JUDGED',
          confidence: v?.confidence ?? 0,
          // Rounded so server and browser print identical attributes (no hydration drift).
          cx: round2(Math.min(w - PAD.right + 4, Math.max(PAD.left - 4, x))),
          cy: round2(yForTvl(pool.tvlUsd, h)),
          r: round2(radiusForTvl(pool.tvlUsd) * (w < 560 ? 0.72 : 1)),
        };
      }),
    [pools, verdicts, w, h],
  );

  const dotsRef = useRef(dots);
  dotsRef.current = dots;

  // Rings first, filled verdicts on top.
  const drawOrder = useMemo(() => {
    const rank = (d: Dot) => (d.label === 'DEPOSIT' || d.label === 'AVOID' ? 1 : 0);
    return [...dots].sort((a, b) => rank(a) - rank(b) || b.pool.tvlUsd - a.pool.tvlUsd);
  }, [dots]);

  const notes = useMemo(
    () =>
      annotate
        .map((id) => dots.find((d) => d.pool.id === id))
        .filter((d): d is Dot => Boolean(d))
        .map((d) => {
          const [l1, l2] = annotationLines(d.pool, verdicts[d.pool.id]);
          const anchorEnd = d.cx > w * 0.58;
          const tx = d.cx + (anchorEnd ? -34 : 34);
          const ty = d.cy - 34;
          return { d, l1, l2, anchorEnd, tx, ty, lineY: ty + 18 };
        }),
    [annotate, dots, verdicts, w],
  );

  // ---- Weigh-in animation (spec §5), plays once per mount --------------------------------
  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPre(false);
      return;
    }
    const circles = dotRefs.current;
    const scan = scanRef.current;
    const finals = () =>
      circles.map((c, i) => {
        const d = c ? dotsRef.current[i] : undefined;
        return d ? colorForVerdict(d.label) : { fill: null, stroke: null };
      });
    circles.forEach((c) => {
      if (!c) return;
      c.style.opacity = '0';
      c.style.fill = 'none';
      c.style.stroke = VERDICT_COLORS.PRE_SCAN_RING;
      c.style.transform = '';
    });
    noteRefs.current.forEach((n) => n && (n.style.opacity = '0'));
    const painted = new Set<number>();
    const paint = (i: number, pop: boolean) => {
      const c = circles[i];
      if (!c || painted.has(i)) return;
      painted.add(i);
      const { fill, stroke } = finals()[i];
      c.style.fill = fill ?? 'none';
      c.style.stroke = stroke ?? 'none';
      c.style.fillOpacity = fill ? String(DOT_FILL_OPACITY) : '';
      if (pop) {
        c.style.transformBox = 'view-box';
        c.style.transformOrigin = `${c.cx.baseVal.value}px ${c.cy.baseVal.value}px`;
        c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
          duration: POP_MS,
          easing: 'ease-out',
        });
      }
    };

    let raf = 0;
    let timer = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0;
      circles.forEach((c, i) => {
        if (c) c.style.opacity = String(Math.min(1, Math.max(0, (t - fadeDelay(i)) / 350)));
      });
      const raw = (t - SCAN_START_MS) / SCAN_DURATION_MS;
      if (raw >= 1) {
        scan?.setAttribute('opacity', '0');
        circles.forEach((_, i) => paint(i, false));
        noteRefs.current.forEach((n) => n && (n.style.opacity = '1'));
        timer = window.setTimeout(() => {
          circles.forEach((c) => {
            if (!c) return;
            c.style.opacity = c.style.fill = c.style.stroke = c.style.fillOpacity = '';
            c.style.transform = c.style.transformBox = c.style.transformOrigin = '';
          });
          setPre(false);
        }, ANNOTATION_FADE_MS + 50);
        return;
      }
      if (raw > 0) {
        const cw = wRef.current;
        const x = xForApy(0, cw) + scanProgress(t) * (xForApy(APY_MAX, cw) - xForApy(0, cw));
        scan?.setAttribute('x1', String(x));
        scan?.setAttribute('x2', String(x));
        scan?.setAttribute('opacity', String(0.35 * (1 - Math.abs(raw - 0.5) * 1.4)));
        circles.forEach((c, i) => {
          if (c && c.cx.baseVal.value <= x) paint(i, true);
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // Runs once per mount; geometry is read from refs each frame.
  }, [animate]);

  // ---- hover / select -----------------------------------------------------------------
  const nearest = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * w;
      const y = ((clientY - rect.top) / rect.height) * h;
      let best: number | null = null;
      let bestScore = Infinity;
      for (const d of dots) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        const score = dist - d.r;
        if (dist <= d.r + 7 && score < bestScore) {
          best = d.i;
          bestScore = score;
        }
      }
      return best;
    },
    [dots, w, h],
  );

  const hovered = hover != null ? dots[hover] : null;
  const hoveredVerdict = hovered ? verdicts[hovered.pool.id] : undefined;

  return (
    <div ref={wrapRef} className={`relative w-full ${className ?? ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Field chart of ${pools.length} Monad pools by headline APY and TVL, coloured by verdict`}
        className={`block w-full select-none ${pre ? 'field-pre' : ''}`}
        style={{ height: 'auto', aspectRatio: `${w} / ${h}`, cursor: hover != null && onSelect ? 'pointer' : 'default' }}
        onPointerMove={(e) => setHover(nearest(e.clientX, e.clientY))}
        onPointerDown={(e) => setHover(nearest(e.clientX, e.clientY))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const i = nearest(e.clientX, e.clientY);
          if (i != null) onSelect?.(dots[i].pool.id);
        }}
      >
        {/* grid + axes */}
        {[0, 5, 10, 15, 20, 25, 30].map((a) => (
          <g key={a}>
            <line x1={xForApy(a, w)} x2={xForApy(a, w)} y1={10} y2={h - PAD.bottom + 2} stroke="#E6E4DE" />
            <text
              x={xForApy(a, w)}
              y={h - 9}
              fontSize={10}
              fill="#A9A6B0"
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
            >
              {a}%{a === APY_MAX ? '+' : ''}
            </text>
          </g>
        ))}
        {TVL_TICKS.map(([tvl, label]) => (
          <text
            key={label}
            x={PAD.left - 10}
            y={yForTvl(tvl, h) + 3}
            fontSize={9.5}
            fill="#A9A6B0"
            fontFamily="var(--font-geist-mono), monospace"
            textAnchor="end"
          >
            {label}
          </text>
        ))}

        <line
          ref={scanRef}
          x1={0}
          x2={0}
          y1={6}
          y2={h - PAD.bottom + 4}
          stroke="#16151A"
          strokeWidth={1}
          opacity={0}
          pointerEvents="none"
        />

        {drawOrder.map((d) => {
          const { fill, stroke } = colorForVerdict(d.label);
          return (
            <circle
              key={d.pool.id}
              ref={(el) => {
                dotRefs.current[d.i] = el;
              }}
              className="dot"
              cx={d.cx}
              cy={d.cy}
              r={d.r}
              fill={fill ?? 'none'}
              fillOpacity={fill ? DOT_FILL_OPACITY : undefined}
              stroke={stroke ?? 'none'}
              strokeWidth={1.1}
            />
          );
        })}

        {hovered && (
          <circle
            cx={hovered.cx}
            cy={hovered.cy}
            r={hovered.r + 3}
            fill="none"
            stroke="#16151A"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}

        {notes.map((n, k) => (
          <g
            key={n.d.pool.id}
            ref={(el) => {
              noteRefs.current[k] = el;
            }}
            className="field-note"
            pointerEvents="none"
          >
            <line x1={n.d.cx} y1={n.d.cy} x2={n.tx} y2={n.lineY} stroke="#16151A" strokeWidth={0.8} />
            <text
              x={n.tx + (n.anchorEnd ? -4 : 4)}
              y={n.ty}
              fontSize={11}
              fontWeight={500}
              fill="#16151A"
              textAnchor={n.anchorEnd ? 'end' : 'start'}
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              {n.l1}
            </text>
            <text
              x={n.tx + (n.anchorEnd ? -4 : 4)}
              y={n.ty + 14}
              fontSize={10}
              fill="#8B8894"
              textAnchor={n.anchorEnd ? 'end' : 'start'}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {n.l2}
            </text>
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg border border-hairline bg-paper px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(32,0,82,0.25)]"
          style={{
            left: Math.min(Math.max(hovered.cx, 110), w - 110),
            top: hovered.cy < 90 ? hovered.cy + hovered.r + 10 : hovered.cy - hovered.r - 10,
            transform: hovered.cy < 90 ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          }}
        >
          <div className="font-medium text-ink">{formatPoolName(hovered.pool)}</div>
          <div className="mono mt-0.5 flex items-center gap-1.5 text-[11px] text-secondary">
            <span
              className="inline-block size-2 rounded-full"
              style={{
                background: colorForVerdict(hovered.label).fill ?? 'transparent',
                border: colorForVerdict(hovered.label).fill ? 'none' : `1.5px solid ${colorForVerdict(hovered.label).stroke}`,
              }}
            />
            {hovered.label === 'NOT_JUDGED' ? 'NOT JUDGED' : hovered.label}
            {hoveredVerdict && hovered.label !== 'NOT_JUDGED' ? ` · ${formatConfidence(hoveredVerdict.confidence)}` : ''}
          </div>
          <div className="mono mt-1 text-[11px] text-muted">
            {formatPct(hovered.pool.apy)} headline · {formatPct(hovered.pool.realApy)} real · {formatTvl(hovered.pool.tvlUsd)}
          </div>
        </div>
      )}
    </div>
  );
}
