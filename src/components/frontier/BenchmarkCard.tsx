import {
  fmtLimit,
  hardwareBySlug,
  isDemo,
  ladder,
  modelBySlug,
  speedup,
  type Benchmark,
} from "@/data/frontier";

const DASH = "—";

/** Card body for one model × hardware benchmark. Router-free; the route wraps it in a Link. */
export function BenchmarkCard({ bench }: { bench: Benchmark }) {
  const engines = [...new Set(bench.recipes.map((r) => r.engine.name))].join(", ");
  return (
    <div className="flex h-full flex-col p-4 text-[13px]">
      <div className="text-[14px] font-medium">
        <span>{modelBySlug(bench.model)?.name ?? bench.model}</span>
        <span className="text-muted-foreground"> · </span>
        <span>{hardwareBySlug(bench.hardware)?.name ?? bench.hardware}</span>
      </div>
      <div className="num mt-0.5 text-[12px] text-muted-foreground">
        baseline {bench.baseline.metrics.latencyS.toFixed(1)}s
      </div>

      <table className="num mt-3 w-full border-collapse">
        <tbody>
          {ladder(bench).map(({ limit, recipe }) => (
            <tr key={limit} className="border-t border-border">
              <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                ≤ {fmtLimit(limit)} LPIPS
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                {recipe ? `${recipe.metrics.latencyS.toFixed(1)}s` : DASH}
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                {recipe ? `${speedup(bench, recipe).toFixed(1)}×` : DASH}
              </td>
              <td className="max-w-0 w-full truncate py-1.5 text-muted-foreground">
                {recipe ? recipe.name : DASH}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="num mt-auto flex items-baseline justify-between gap-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
        <span className="truncate">
          {[`${bench.recipes.length} recipes`, engines, bench.updated].join(" · ")}
        </span>
        {isDemo(bench) && <span className="shrink-0 text-experimental">demo data</span>}
        <span aria-hidden="true">→</span>
      </div>
    </div>
  );
}
