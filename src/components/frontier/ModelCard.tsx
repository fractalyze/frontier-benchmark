import { useState, type ReactNode } from "react";
import { fmtLimit, ladder, speedup, type Benchmark, type ModelInfo } from "@/data/frontier";
import { HardwareSelect } from "./HardwareSelect";

const DASH = "—";

/**
 * One model, a hardware select, and the fastest recipe at each quality limit.
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
  return (
    <div className="relative flex h-full flex-col rounded-sm border border-border p-4 text-[13px] transition-colors hover:bg-surface-alt">
      <div className="flex items-baseline justify-between gap-3">
        {renderLink(
          bench,
          <span className="text-[14px] font-medium after:absolute after:inset-0">
            {model.name}
          </span>,
        )}
        <HardwareSelect
          model={model.slug}
          value={bench.hardware}
          onChange={setHardware}
          className="relative z-10 text-[13px] text-muted-foreground"
        />
      </div>
      <div className="num mt-0.5 text-[12px] text-muted-foreground">
        baseline {bench.baseline.metrics.latencyS.toFixed(1)}s
      </div>

      <table className="num mt-3 w-full border-collapse">
        <tbody>
          {ladder(bench).map(({ limit, recipe }) => (
            <tr key={limit} className="border-t border-border">
              <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                ≤ {fmtLimit(limit)}
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium">
                {recipe ? `${recipe.metrics.latencyS.toFixed(1)}s` : DASH}
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap text-muted-foreground">
                {recipe ? `${speedup(bench, recipe).toFixed(1)}×` : DASH}
              </td>
              <td className="w-full max-w-0 truncate py-1.5 text-muted-foreground">
                {recipe ? recipe.name : DASH}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
