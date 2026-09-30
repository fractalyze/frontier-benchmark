import { useState, type ReactNode } from "react";
import { fmtLimit, isDemo, ladder, speedup, type Benchmark, type ModelInfo } from "@/data/frontier";
import { HardwareSelect } from "./HardwareSelect";

const DASH = "—";

/**
 * One model, a hardware select, and the fastest recipe at each quality limit.
 * Router-free: the route supplies the link around the title via renderLink.
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
    <div className="flex h-full flex-col rounded-sm border border-border p-4 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        {renderLink(
          bench,
          <span className="text-[14px] font-medium hover:text-primary">{model.name}</span>,
        )}
        <HardwareSelect
          model={model.slug}
          value={bench.hardware}
          onChange={setHardware}
          className="text-[13px] text-muted-foreground"
        />
      </div>

      <table className="num mt-3 w-full border-collapse">
        <tbody>
          {ladder(bench).map(({ limit, recipe }) => (
            <tr key={limit} className="border-t border-border">
              <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                ≤ {fmtLimit(limit)}
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium">
                {recipe ? `${speedup(bench, recipe).toFixed(1)}×` : DASH}
              </td>
              <td className="w-full max-w-0 truncate py-1.5 text-muted-foreground">
                {recipe ? recipe.name : DASH}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-auto flex items-baseline justify-between border-t border-border pt-2.5 text-[12px]">
        <span className="text-experimental">{isDemo(bench) ? "demo data" : ""}</span>
        {renderLink(
          bench,
          <span className="text-muted-foreground hover:text-primary">Details →</span>,
        )}
      </div>
    </div>
  );
}
