import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { fastestUnder, findBenchmark, fmtLpips, hardwareBySlug, modelBySlug, speedup } from "@/data/frontier";
import { SiteShell } from "@/components/frontier/SiteShell";
import { IdentitySelect } from "@/components/frontier/IdentitySelect";
import { ParetoFigure } from "@/components/frontier/ParetoFigure";
import { ResultsTable } from "@/components/frontier/ResultsTable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$model/$hardware")({
  loader: ({ params }) => {
    const bench = findBenchmark(params.model, params.hardware);
    if (!bench) throw notFound();
    return { bench, modelName: modelBySlug(bench.model)!.name, hwName: hardwareBySlug(bench.hardware)!.name };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.modelName} × ${loaderData.hwName}` : "Benchmark";
    const d = `Pareto frontier of latency vs. quality loss for optimization recipes on ${t}.`;
    return {
      meta: [
        { title: `${t} — Inference Frontier` },
        { name: "description", content: d },
        { property: "og:title", content: `${t} — Inference Frontier` },
        { property: "og:description", content: d },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => (
    <SiteShell>
      <p className="pt-10 text-[14px] text-muted-foreground">No benchmark data for this model × hardware yet.</p>
    </SiteShell>
  ),
  component: BenchmarkPage,
});

const LIMITS = [0.01, 0.03, 0.05, 0.1];

function BenchmarkPage() {
  const { bench } = Route.useLoaderData();
  const [limit, setLimit] = useState(0.05);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const best = fastestUnder(bench.recipes, limit);
  const selected = bench.recipes.find((r) => r.id === picked) ?? best;

  const select = (id: string) => {
    setPicked(id);
    setOpenId((o) => (o === id ? null : id));
  };
  const changeLimit = (l: number) => {
    setLimit(l);
    setPicked(null);
    setOpenId(null);
  };

  return (
    <SiteShell>
      <section className="pt-8">
        <IdentitySelect model={bench.model} hardware={bench.hardware} />
        <p className="num mt-2 text-[12px] text-muted-foreground">
          {bench.resolution} · Batch {bench.batch} · {bench.training} · {bench.protocol} · {bench.date}
          <span className="ml-3 text-experimental">demo data</span>
        </p>
      </section>

      <section className="mt-6">
        <ParetoFigure bench={bench} limit={limit} selectedId={selected?.id ?? null} onSelect={select} />

        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-baseline sm:gap-10">
          <div className="flex items-baseline gap-5">
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Quality limit</span>
            {LIMITS.map((l) => (
              <button
                key={l}
                onClick={() => changeLimit(l)}
                className={cn(
                  "num border-b-2 pb-0.5 text-[14px] transition-colors",
                  limit === l ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                ≤ {l.toFixed(2).replace(/^0/, "")}
              </button>
            ))}
          </div>
          {selected ? (
            <div className="min-w-0 text-[14px]">
              <span className="num font-medium">
                {selected.latencyS.toFixed(1)}s · LPIPS {fmtLpips(selected.lpipsMean)} · {speedup(bench, selected).toFixed(1)}×
              </span>
              <span className="ml-3 text-muted-foreground">{selected.name}</span>
            </div>
          ) : (
            <span className="text-[14px] text-muted-foreground">No measured recipe meets this limit.</span>
          )}
        </div>
      </section>

      <section className="mt-10">
        <ResultsTable bench={bench} limit={limit} selectedId={selected?.id ?? null} openId={openId} onSelect={select} />
        <p className="mt-2 text-[12px] text-muted-foreground">All numbers are demo placeholders, not benchmark results.</p>
      </section>

      <section className="mt-14 border-t border-border pt-5">
        <h2 className="text-[16px] font-semibold tracking-tight">Add a recipe</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Found a better optimization combination? <span className="text-foreground">Submit a reproducible recipe through GitHub.</span>
        </p>
        <a href="#" className="mt-3 inline-block rounded-sm border border-foreground/70 px-3 py-1 text-[13px] hover:bg-surface-alt">
          Submit via GitHub ↗
        </a>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Submissions are evaluated under the same model, hardware, workload, and quality protocol. The submission unit is a complete recipe.
        </p>
      </section>
    </SiteShell>
  );
}
