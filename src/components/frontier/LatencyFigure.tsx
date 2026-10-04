import {
  fmtLatency,
  fmtLoss,
  lossOf,
  speedup,
  workloadOf,
  type Benchmark,
  type Recipe,
} from "@/data/frontier";
import { cn } from "@/lib/utils";

const roundTo = (v: number, digits: number) => +v.toFixed(digits);

/**
 * One bar per recipe, fastest first; the quality loss is only a pass/fail gate, set with
 * two buttons. Drawn for a workload whose loss is too coarse to rank recipes on an axis
 * (`chart: "latency"` in WORKLOADS); the Pareto scatter is ParetoFigure.
 */
export function LatencyFigure({
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
  onLimitChange: (limit: number) => void;
}) {
  const { quality, latency } = workloadOf(bench);
  const loss = (r: Recipe) => lossOf(bench, r);
  const rows = [...bench.recipes].sort((a, c) => a.metrics.latencyS - c.metrics.latencyS);
  const slowest = rows[rows.length - 1]!.metrics.latencyS;
  // The gate runs one step past the recipes' losses: tight enough to fail all, loose enough
  // to pass all.
  const losses = rows.map((r) => loss(r));
  const gateMin = roundTo(
    Math.max(quality.limitMin, Math.min(...losses) - quality.limitStep),
    quality.digits,
  );
  const gateMax = roundTo(
    Math.max(quality.defaultLimit, ...losses) + quality.limitStep,
    quality.digits,
  );
  const move = (delta: number) =>
    onLimitChange(Math.min(gateMax, Math.max(gateMin, roundTo(limit + delta, quality.digits))));
  const gateButton =
    "num flex size-7 items-center justify-center rounded-sm border border-border text-[14px] hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Quality gate
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={gateButton}
            aria-label={`Tighten the gate: lower the maximum ${quality.name}`}
            disabled={limit <= gateMin}
            onClick={() => move(-quality.limitStep)}
          >
            −
          </button>
          <output
            data-testid="quality-gate"
            aria-live="polite"
            className="num min-w-36 rounded-full bg-foreground px-3 py-1 text-center text-[12px] font-medium text-background"
          >
            {quality.name} ≤ {fmtLoss(bench, limit)}
          </output>
          <button
            type="button"
            className={gateButton}
            aria-label={`Loosen the gate: raise the maximum ${quality.name}`}
            disabled={limit >= gateMax}
            onClick={() => move(quality.limitStep)}
          >
            +
          </button>
        </div>
      </div>

      <ol className="mt-4 border-t border-border" aria-label={latency.axis}>
        {rows.map((r) => {
          const pass = loss(r) <= limit;
          const sel = r.id === selectedId;
          return (
            <li key={r.id} className="border-b border-border">
              <button
                type="button"
                data-recipe={r.id}
                data-pass={pass}
                aria-pressed={sel}
                onClick={() => onSelect(r.id)}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 text-left hover:bg-surface-alt sm:grid-cols-[11rem_1fr_auto]",
                  !pass && "opacity-45",
                )}
              >
                <span className={cn("truncate text-[14px]", sel ? "font-semibold" : "font-medium")}>
                  {r.name}
                </span>
                <span className="num col-span-2 row-start-2 h-2.5 rounded-full bg-surface-alt sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <span
                    data-bar
                    className={cn(
                      "block h-full rounded-full",
                      sel ? "bg-frontier" : pass ? "bg-frontier/45" : "bg-dominated",
                    )}
                    style={{ width: `${(r.metrics.latencyS / slowest) * 100}%` }}
                  />
                </span>
                <span className="num flex items-baseline justify-end gap-3 text-[13px] whitespace-nowrap">
                  <span className={sel ? "font-semibold" : undefined}>
                    {fmtLatency(bench, r.metrics.latencyS)}
                  </span>
                  <span className="w-10 text-right text-muted-foreground">
                    {speedup(bench, r).toFixed(1)}×
                  </span>
                  {/* the gate above names the loss; a phone has no room to repeat it per row */}
                  <span className="w-16 text-right text-muted-foreground sm:w-32">
                    <span className="hidden sm:inline">{quality.name} </span>
                    {fmtLoss(bench, loss(r))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12px] text-muted-foreground">{latency.axis}; shorter is better.</p>
    </div>
  );
}
