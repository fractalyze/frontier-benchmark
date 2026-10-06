import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKLOADS,
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
    /** the in-chart value tag needs room; on a phone the card below shows the value */
    showTag: !narrow,
  };
};
/** Arrow keys move an image page's requirement line by this much; a drag is continuous
    (0.001). Every scale comes from the workload: see `quality` and `latency` in WORKLOADS. */
export const LIMIT_STEP = WORKLOADS.image.quality.limitStep;
/** Left/right arrow keys slide the grip along the line by this fraction of its length. */
const GRIP_STEP = 0.05;
const GRIP_W = 30;

const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const roundTo = (v: number, digits: number) => +v.toFixed(digits);
const ceilTo = (v: number, digits: number) => Math.ceil(v * 10 ** digits) / 10 ** digits;

/** Latency axis [min, max]: starts below the fastest recipe, on a tick, not at zero. */
export function xDomain(
  latencies: number[],
  step = WORKLOADS.image.latency.step,
): [number, number] {
  const lo = Math.min(...latencies);
  const hi = Math.max(...latencies);
  const min = Math.max(0, Math.floor((lo - (hi - lo) * 0.12) / step) * step);
  return [min, hi + (hi - min) * 0.08];
}

/** Loss axis [0, max]: every loss is nonnegative, the baseline's is zero. */
function yDomain(losses: number[], span: number): [number, number] {
  return [0, Math.max(span, ...losses) * 1.12];
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
  const [hover, setHover] = useState<Recipe | null>(null);
  /** Where the grip sits along the requirement line, 0..1; it only marks a handle,
      so it is free to move left or right out of the way of the points. */
  const [gripFrac, setGripFrac] = useState(0.5);
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
  const { quality, latency } = workload;
  const { xMin, xMax, yMin, yMax, frontier, frontierIds } = useMemo(() => {
    const f = paretoFrontier(bench);
    const [xMin, xMax] = xDomain(
      recipes.map((r) => r.metrics.latencyS),
      latency.step,
    );
    const [yMin, yMax] = yDomain(
      recipes.map((r) => lossOf(bench, r)),
      quality.span,
    );
    return { xMin, xMax, yMin, yMax, frontier: f, frontierIds: new Set(f.map((r) => r.id)) };
  }, [bench, recipes, latency.step, quality.span]);

  const x = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const fromY = (py: number) => yMin + ((H - PAD.b - py) / (H - PAD.t - PAD.b)) * (yMax - yMin);
  const xTicks = ticks(xMin, xMax, latency.step);
  const yTicks = ticks(yMin, yMax, quality.step);
  const labelled = new Set([bench.baselineRecipe, selectedId ?? ""]);
  // The limit stays inside the plot: never below the axis (or the workload's floor), and one
  // step below its top.
  const limitMin = Math.max(quality.limitMin, ceilTo(yMin, quality.digits));
  const limitMax = roundTo(yMax - quality.limitStep, quality.digits);
  const clampLimit = (v: number) => clampTo(roundTo(v, quality.digits), limitMin, limitMax);

  /** Pointer position in SVG user units; null when the SVG is not laid out (tests). */
  const pointerInSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  };
  const limitFromPointer = (e: React.PointerEvent) => {
    const pt = pointerInSvg(e);
    return pt ? clampLimit(fromY(pt.y)) : limit;
  };
  const nudge = (delta: number) => onLimitChange(clampLimit(limit + delta));
  const ly = y(limit);
  const tag = `${workload.quality.name} ≤ ${fmtLoss(bench, limit)}`;
  /** The dashed line runs from the y axis to the tag (or the plot edge); the grip stays on it. */
  // the tag is monospace 12px: about 7.3 px a character, plus its rounded ends
  const tagW = Math.max(124, Math.ceil(tag.length * 7.3) + 26);
  const lineEnd = showTag ? W - PAD.r - tagW - 8 : W - PAD.r;
  const gripMin = PAD.l + GRIP_W / 2;
  const gripMax = lineEnd - GRIP_W / 2;
  const gripX = gripMin + gripFrac * (gripMax - gripMin);
  const moveGrip = (frac: number) => setGripFrac(clampTo(frac, 0, 1));
  /** Dragging the grip sets the limit from the pointer's height and slides the grip to its x. */
  const dragGrip = (e: React.PointerEvent) => {
    const pt = pointerInSvg(e);
    if (!pt) return;
    onLimitChange(clampLimit(fromY(pt.y)));
    moveGrip((pt.x - gripMin) / (gripMax - gripMin));
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
              {t === 0 ? "0" : quality.tick(t)}
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
              {latency.tick(t)}
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
          {quality.axis}
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
              {/* frontier points: solid, blue within the limit, grey above it;
                  dominated recipes: hollow grey rings, fainter above the limit */}
              <circle
                cx={cx}
                cy={cy}
                r={sel ? 6.5 : onF ? 4.5 : 3.5}
                className={cn(
                  sel || onF ? "stroke-background" : "fill-background stroke-dominated-strong",
                  sel || (onF && !out) ? "fill-frontier" : onF && "fill-dominated-strong",
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

        {/* the quality requirement: drag the line up or down, or drag its grip
            (which also slides left and right), or focus the grip and use the arrow keys */}
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
            x2={lineEnd}
            y1={0}
            y2={0}
            className="stroke-foreground"
            strokeWidth={1.3}
            strokeDasharray="5 4"
          />
          <g
            data-testid="limit-grip"
            role="slider"
            tabIndex={0}
            aria-label={`Quality limit: maximum acceptable ${workload.quality.name}`}
            aria-orientation="vertical"
            aria-valuemin={limitMin}
            aria-valuemax={limitMax}
            aria-valuenow={limit}
            aria-valuetext={tag}
            transform={`translate(${gripX} 0)`}
            className="cursor-move outline-none [&:focus-visible>rect]:stroke-ring [&:focus-visible>rect]:stroke-2"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              dragGrip(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) dragGrip(e);
            }}
            onKeyDown={(e) => {
              const step = quality.limitStep * (e.shiftKey ? 4 : 1);
              if (e.key === "ArrowUp") nudge(step);
              else if (e.key === "ArrowDown") nudge(-step);
              else if (e.key === "ArrowRight") moveGrip(gripFrac + GRIP_STEP);
              else if (e.key === "ArrowLeft") moveGrip(gripFrac - GRIP_STEP);
              else return;
              e.preventDefault();
            }}
          >
            <rect
              x={-GRIP_W / 2}
              y={-6}
              width={GRIP_W}
              height={12}
              rx={6}
              className="fill-background stroke-foreground"
              strokeWidth={1.3}
            />
          </g>
          {showTag && (
            <>
              <rect
                x={W - PAD.r - tagW}
                y={-12}
                width={tagW}
                height={24}
                rx={12}
                className="fill-foreground"
              />
              <text
                x={W - PAD.r - tagW / 2}
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
            {fmtLoss(bench, loss(hover))} · {speedup(bench, hover).toFixed(1)}× faster
          </div>
        </div>
      )}
    </div>
  );
}

/** Multiples of step within [min, max]. */
function ticks(min: number, max: number, step: number) {
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k++)
    out.push(+(k * step).toFixed(4));
  return out;
}
