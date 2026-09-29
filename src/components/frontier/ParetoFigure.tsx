import { useMemo, useState } from "react";
import {
  fmtLpips,
  lpipsOf,
  paretoFrontier,
  speedup,
  type Benchmark,
  type Recipe,
} from "@/data/frontier";
import { cn } from "@/lib/utils";

const W = 1180;
const H = 500;
const PAD = { l: 64, r: 24, t: 18, b: 52 };

export function ParetoFigure({
  bench,
  limit,
  selectedId,
  onSelect,
}: {
  bench: Benchmark;
  limit: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const recipes = bench.recipes;
  const [hover, setHover] = useState<Recipe | null>(null);
  const { xMax, yMax, frontier, frontierIds } = useMemo(() => {
    const f = paretoFrontier(recipes);
    return {
      xMax: Math.max(...recipes.map((r) => r.metrics.latencyS)) * 1.08,
      yMax: Math.max(0.1, ...recipes.map(lpipsOf)) * 1.12,
      frontier: f,
      frontierIds: new Set(f.map((r) => r.id)),
    };
  }, [recipes]);

  const x = (v: number) => PAD.l + (v / xMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const xTicks = ticks(xMax, 2);
  const yTicks = ticks(yMax, 0.02);
  const labelled = new Set(["sglang-default", selectedId ?? ""]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        role="img"
        aria-label="Pareto frontier: quality loss versus latency"
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-grid" />
            <text
              x={PAD.l - 10}
              y={y(t) + 4}
              textAnchor="end"
              className="num fill-muted-foreground text-[12px]"
            >
              {t === 0 ? "0" : fmtLpips(t)}
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
          E2E latency (s)
        </text>
        <text
          transform={`translate(16 ${(H - PAD.b + PAD.t) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-muted-foreground text-[13px]"
        >
          Quality loss (LPIPS)
        </text>
        <text
          x={PAD.l + 12}
          y={H - PAD.b - 10}
          className="fill-muted-foreground/70 text-[12px] italic"
        >
          ↙ better
        </text>

        {/* quality limit */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(limit)}
          y2={y(limit)}
          className="stroke-foreground/40"
          strokeDasharray="5 4"
        />
        <text
          x={W - PAD.r}
          y={y(limit) - 7}
          textAnchor="end"
          className="fill-muted-foreground text-[12px]"
        >
          quality limit
        </text>

        <polyline
          points={frontier.map((r) => `${x(r.metrics.latencyS)},${y(lpipsOf(r))}`).join(" ")}
          fill="none"
          className="stroke-frontier"
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />

        {recipes.map((r) => {
          const onF = frontierIds.has(r.id);
          const sel = r.id === selectedId;
          const out = lpipsOf(r) > limit;
          const cx = x(r.metrics.latencyS);
          const cy = y(lpipsOf(r));
          const right = cx > W * 0.7;
          return (
            <g
              key={r.id}
              className="cursor-pointer"
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(r.id)}
            >
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              {sel && <circle cx={cx} cy={cy} r={11} className="fill-frontier/12" />}
              <circle
                cx={cx}
                cy={cy}
                r={sel ? 6.5 : onF ? 4.5 : 4}
                className={cn(
                  onF || sel ? "fill-frontier" : "fill-dominated",
                  out && !sel && "opacity-35",
                )}
                stroke="var(--background)"
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
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-sm border border-border bg-popover px-2.5 py-2 text-[12px]"
          style={{
            left: `${(x(hover.metrics.latencyS) / W) * 100}%`,
            top: `${(y(lpipsOf(hover)) / H) * 100}%`,
            transform: `translate(${x(hover.metrics.latencyS) > W * 0.6 ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <div className="max-w-64 font-medium">{hover.name}</div>
          <div className="num mt-1 text-muted-foreground">
            {hover.metrics.latencyS.toFixed(1)}s · LPIPS {fmtLpips(lpipsOf(hover))} ·{" "}
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
