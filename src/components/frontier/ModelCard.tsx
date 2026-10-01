import { useState, type ReactNode } from "react";
import {
  fmtLatency,
  fmtLoss,
  hardwareBySlug,
  lossOf,
  paretoFrontier,
  speedup,
  workloadOf,
  type Benchmark,
  type ModelInfo,
} from "@/data/frontier";
import { HardwareSelect } from "./HardwareSelect";

const DASH = "—";

/**
 * One model, a hardware select, and the benchmark's Pareto frontier: every recipe that is
 * the fastest at its quality loss (the same points the benchmark page's chart connects),
 * so the card always restates the page's numbers.
 * Router-free: the route supplies the link around the title via renderLink. The link's inner
 * span is stretched over the whole card, so the card is clickable without nesting the select
 * inside an anchor; the select sits above it with z-10.
 */
export function ModelCard({
  model,
  benches,
  renderLink,
}: {
  model: ModelInfo;
  /** Benchmarks for this model, one per hardware; must be non-empty. */
  benches: Benchmark[];
  renderLink: (bench: Benchmark, children: ReactNode) => ReactNode;
}) {
  const [hardware, setHardware] = useState(benches[0]!.hardware);
  const bench = benches.find((b) => b.hardware === hardware) ?? benches[0]!;
  // quality-first: the frontier read from the baseline towards the fastest recipe
  const frontier = paretoFrontier(bench)
    .filter((r) => r.id !== bench.baseline.id)
    .reverse();
  const workload = workloadOf(bench);
  return (
    <div className="group relative flex h-full cursor-pointer flex-col rounded-sm border border-border p-4 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow] hover:border-border-strong hover:bg-surface-alt hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] focus-within:border-primary">
      <div className="flex items-baseline justify-between gap-3">
        {renderLink(
          bench,
          <span className="text-[14px] font-medium after:absolute after:inset-0 group-hover:text-primary">
            {model.name}
          </span>,
        )}
        <HardwareSelect
          hardware={benches.map((b) => hardwareBySlug(b.hardware)).filter((h) => h !== undefined)}
          value={bench.hardware}
          onChange={setHardware}
          className="relative z-10 text-[13px] text-muted-foreground"
        />
      </div>
      <div className="num mt-0.5 text-[12px] text-muted-foreground">
        baseline {fmtLatency(bench, bench.baseline.metrics.latencyS)}
      </div>

      {frontier.length ? (
        <table className="num mt-3 w-full border-collapse">
          <thead>
            <tr className="text-[10px] tracking-wider text-muted-foreground uppercase">
              <th className="pb-1 pr-3 text-left font-medium">{workload.quality.name}</th>
              <th className="pb-1 pr-3 text-right font-medium">Latency</th>
              <th className="pb-1 pr-3 text-right font-medium">Speedup</th>
              <th className="pb-1 text-left font-medium">Recipe</th>
            </tr>
          </thead>
          <tbody>
            {frontier.map((recipe) => (
              <tr key={recipe.id} className="border-t border-border">
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                  {fmtLoss(bench, lossOf(bench, recipe))}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium">
                  {fmtLatency(bench, recipe.metrics.latencyS)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap text-muted-foreground">
                  {speedup(bench, recipe).toFixed(1)}×
                </td>
                <td className="w-full max-w-0 truncate py-1.5 text-muted-foreground">
                  {recipe.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 border-t border-border pt-2 text-[12px] text-muted-foreground">
          {DASH} no recipe faster than the baseline yet
        </p>
      )}
      <div className="mt-auto flex items-center gap-1 pt-3 text-[12px] font-medium text-primary">
        View benchmark
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </div>
  );
}
