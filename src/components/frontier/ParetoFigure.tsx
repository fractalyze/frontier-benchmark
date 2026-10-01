import { useEffect, useMemo, useRef, useState } from "react";
import {
  fmtLatency,
  fmtLoss,
  lossOf,
  paretoFrontier,
  workloadOf,
  speedup,
  type Benchmark,
  type Recipe,
} from "@/data/frontier";
import { cn } from "@/lib/utils";

/** Chart geometry follows the container width; the height stays readable on a phone. */
const layout = (width: number) => {
  const narrow = width < 640;
  return {
    W: Math.max(320, width),
    H: narrow ? 420 : 500,
    PAD: { l: narrow ? 60 : 64, r: narrow ? 16 : 24, t: 18, b: narrow ? 46 : 52 },
    /** the in-chart value tag needs room; on a phone the slider below shows the value */
    showTag: !narrow,
  };
};
/** Arrow keys move the requirement line by this much; a drag is continuous (0.001). */
export const LIMIT_STEP = 0.005;
const LIMIT_MIN = 0.001;

const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round3 = (v: number) => +v.toFixed(3);
const X_STEP = 2;

/** Latency axis [min, max]: starts below the fastest recipe, on a tick, not at zero. */
export function xDomain(latencies: number[]): [number, number] {
  const lo = Math.min(...latencies);
  const hi = Math.max(...latencies);
  const min = Math.max(0, Math.floor((lo - (hi - lo) * 0.12) / X_STEP) * X_STEP);
  return [min, hi + (hi - min) * 0.08];
}

export function ParetoFigure({
  bench,
  limit,
  selectedId,
  onSelect,
  onLimitChange,
}: {
  bench: Benchmark;
  limit: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The quality requirement was dragged or nudged; always a multiple of LIMIT_STEP. */
  onLimitChange: (limit: number) => void;
}) {
  const recipes = bench.recipes;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Recipe | null>(null);
  const [width, setWidth] = useState(1180);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { W, H, PAD, showTag } = layout(width);
  const workload = workloadOf(bench);
  const loss = (r: Recipe) => lossOf(bench, r);
  const { xMin, xMax, yMax, frontier, frontierIds } = useMemo(() => {
    const f = paretoFrontier(bench);
    const [xMin, xMax] = xDomain(recipes.map((r) => r.metrics.latencyS));
    return {
      xMin,
      xMax,
      yMax: Math.max(0.1, ...recipes.map((r) => lossOf(bench, r))) * 1.12,
      frontier: f,
      frontierIds: new Set(f.map((r) => r.id)),
    };
  }, [bench, recipes]);

  const x = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const fromY = (py: number) => ((H - PAD.b - py) / (H - PAD.t - PAD.b)) * yMax;
  const xTicks = ticks(xMax, X_STEP).filter((t) => t >= xMin);
  const yTicks = ticks(yMax, 0.02);
  const labelled = new Set([bench.baselineRecipe, selectedId ?? ""]);
  const limitMax = round3(yMax - LIMIT_STEP);
  const clampLimit = (v: number) => clampTo(round3(v), LIMIT_MIN, limitMax);

  const limitFromPointer = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return limit;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return clampLimit(fromY(pt.matrixTransform(ctm.inverse()).y));
  };
  const nudge = (delta: number) => onLimitChange(clampLimit(limit + delta));
  const ly = y(limit);
  const tag = `${workload.quality.name} ≤ ${fmtLoss(bench, limit)}`;
  /** Horizontal slider position, 0..1 over the allowed limit range. */
  const frac = (limit - LIMIT_MIN) / (limitMax - LIMIT_MIN);
  const limitFromTrack = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return limit;
    return clampLimit(LIMIT_MIN + clampTo((clientX - r.left) / r.width, 0, 1) * (limitMax - LIMIT_MIN));
  };

  return (
    <div ref={wrapRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="Pareto frontier: quality loss versus latency"
      >
        {/* everything at or below the requirement qualifies */}
        <rect
          x={PAD.l}
          y={ly}
          width={W - PAD.l - PAD.r}
          height={H - PAD.b - ly}
          className="fill-frontier/6"
        />
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-grid" />
            <text
              x={PAD.l - 10}
              y={y(t) + 4}
              textAnchor="end"
              className="num fill-muted-foreground text-[12px]"
            >
              {t === 0 ? "0" : fmtLoss(bench, t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} className="stroke-grid" />
            <text
              x={x(t)}
              y={H - PAD.b + 19}
              textAnchor="middle"
              className="num fill-muted-foreground text-[12px]"
            >
              {t}
            </text>
          </g>
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={H - PAD.b}
          y2={H - PAD.b}
          className="stroke-border-strong"
        />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="stroke-border-strong" />
        <text
          x={(W + PAD.l) / 2}
          y={H - 10}
          textAnchor="middle"
          className="fill-muted-foreground text-[13px]"
        >
          {workload.latency.axis}
        </text>
        <text
          transform={`translate(16 ${(H - PAD.b + PAD.t) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-muted-foreground text-[13px]"
        >
          {`Quality loss (${workload.quality.name})`}
        </text>
        <text
          x={PAD.l + 12}
          y={H - PAD.b - 10}
          className="fill-muted-foreground/70 text-[12px] italic"
        >
          ↙ better
        </text>

        <polyline
          points={frontier.map((r) => `${x(r.metrics.latencyS)},${y(loss(r))}`).join(" ")}
          fill="none"
          className="stroke-frontier"
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />

        {recipes.map((r) => {
          const onF = frontierIds.has(r.id);
          const sel = r.id === selectedId;
          const out = loss(r) > limit;
          const cx = x(r.metrics.latencyS);
          const cy = y(loss(r));
          const right = cx > W * 0.7;
          return (
            <g
              key={r.id}
              data-recipe={r.id}
              data-frontier={onF}
              className="cursor-pointer"
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(r.id)}
            >
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              {sel && <circle cx={cx} cy={cy} r={11} className="fill-frontier/12" />}
              {/* frontier points: blue within the limit, dark grey above it;
                  dominated recipes: small light-grey dots, fainter above the limit */}
              <circle
                cx={cx}
                cy={cy}
                r={sel ? 6.5 : onF ? 4.5 : 3.5}
                className={cn(
                  "stroke-background",
                  sel || (onF && !out) ? "fill-frontier" : "fill-dominated-strong",
                  !onF && out && !sel && "opacity-50",
                )}
                strokeWidth={1.5}
              />
              {labelled.has(r.id) && (
                <text
                  x={cx + (right ? -12 : 12)}
                  y={cy - 10}
                  textAnchor={right ? "end" : "start"}
                  className={cn(
                    "text-[13px]",
                    sel ? "fill-foreground font-medium" : "fill-muted-foreground",
                  )}
                >
                  {r.name}
                </text>
              )}
            </g>
          );
        })}

        {/* the quality requirement: drag the line, or focus it and use the arrow keys */}
        <g
          transform={`translate(0 ${ly})`}
          className="cursor-ns-resize"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onLimitChange(limitFromPointer(e));
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) onLimitChange(limitFromPointer(e));
          }}
        >
          <rect
            x={PAD.l - 8}
            y={-16}
            width={W - PAD.l - PAD.r + 16}
            height={32}
            fill="transparent"
          />
          <line
            x1={PAD.l}
            x2={showTag ? W - PAD.r - 132 : W - PAD.r}
            y1={0}
            y2={0}
            className="stroke-foreground"
            strokeWidth={1.3}
            strokeDasharray="5 4"
          />
          {showTag && (
            <>
              <rect
                x={W - PAD.r - 124}
                y={-12}
                width={124}
                height={24}
                rx={12}
                className="fill-foreground"
              />
              <text
                x={W - PAD.r - 62}
                y={4.5}
                textAnchor="middle"
                className="num fill-background text-[12px] font-medium"
              >
                {tag}
              </text>
            </>
          )}
        </g>
      </svg>

      {/* the quality limit as a horizontal slider: the white grip moves left and right,
          the dashed line above follows */}
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        <span className="shrink-0 font-medium tracking-wider text-muted-foreground uppercase">
          Quality limit
        </span>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`Quality limit: maximum acceptable ${workload.quality.name}`}
          aria-orientation="horizontal"
          aria-valuemin={LIMIT_MIN}
          aria-valuemax={limitMax}
          aria-valuenow={limit}
          aria-valuetext={tag}
          className="relative h-6 flex-1 cursor-ew-resize touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onLimitChange(limitFromTrack(e.clientX));
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) onLimitChange(limitFromTrack(e.clientX));
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? LIMIT_STEP * 4 : LIMIT_STEP;
            if (e.key === "ArrowUp" || e.key === "ArrowRight") nudge(step);
            else if (e.key === "ArrowDown" || e.key === "ArrowLeft") nudge(-step);
            else return;
            e.preventDefault();
          }}
        >
          <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 border-t border-dashed border-foreground" />
          <div
            data-testid="limit-grip"
            className="absolute top-1/2 h-3 w-[30px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.3px] border-foreground bg-background"
            style={{ left: `${frac * 100}%` }}
          />
        </div>
        <span className="num shrink-0 rounded-full bg-foreground px-2.5 py-0.5 font-medium text-background">
          {tag}
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-sm border border-border bg-popover px-2.5 py-2 text-[12px]"
          style={{
            left: `${(x(hover.metrics.latencyS) / W) * 100}%`,
            top: `${(y(loss(hover)) / H) * 100}%`,
            transform: `translate(${x(hover.metrics.latencyS) > W * 0.6 ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <div className="max-w-64 font-medium">{hover.name}</div>
          <div className="num mt-1 text-muted-foreground">
            {fmtLatency(bench, hover.metrics.latencyS)} · {workload.quality.name}{" "}
            {fmtLoss(bench, loss(hover))} ·{" "}
            {speedup(bench, hover).toFixed(1)}× faster
          </div>
        </div>
      )}
    </div>
  );
}

function ticks(max: number, step: number) {
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}
