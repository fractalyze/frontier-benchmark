import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  fastestUnder,
  findBenchmark,
  fmtLimit,
  fmtLpips,
  fmtResolution,
  hardwareBySlug,
  lpipsOf,
  modelBySlug,
  QUALITY_LIMITS,
  speedup,
} from "@/data/frontier";
import { REPO_URL } from "@/data/site";
import { SiteShell } from "@/components/frontier/SiteShell";
import { IdentitySelect } from "@/components/frontier/IdentitySelect";
import { ParetoFigure } from "@/components/frontier/ParetoFigure";
import { ResultsTable } from "@/components/frontier/ResultsTable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$model/$hardware")({
  loader: ({ params }) => {
    const bench = findBenchmark(params.model, params.hardware);
    if (!bench) throw notFound();
    return {
      bench,
      modelName: modelBySlug(bench.model)!.name,
      hwName: hardwareBySlug(bench.hardware)!.name,
    };
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
      <p className="pt-10 text-[14px] text-muted-foreground">
        No benchmark data for this model × hardware yet.
      </p>
    </SiteShell>
  ),
  component: BenchmarkPage,
});

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
        <dl className="num mt-4 flex flex-wrap gap-x-7 gap-y-2">
          {[
            ["Resolution", fmtResolution(bench.protocol.resolution)],
            ["Batch", bench.protocol.batch],
            ["Steps", bench.protocol.steps],
            ["Precision", bench.protocol.precision],
            ["Guidance", bench.protocol.guidance],
            ["Attention", bench.protocol.attention],
            ["Offload", bench.protocol.offload],
            ["Protocol", bench.protocol.version],
            ["Prompts", `${bench.promptSets.public.count} public`],
            ["Updated", bench.updated],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                {k}
              </dt>
              <dd className="text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6">
        <ParetoFigure
          bench={bench}
          limit={limit}
          selectedId={selected?.id ?? null}
          onSelect={select}
        />

        <div className="mt-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Quality limit
            </span>
            {QUALITY_LIMITS.map((l) => (
              <button
                key={l}
                onClick={() => changeLimit(l)}
                className={cn(
                  "num border-b-2 pb-0.5 text-[14px] transition-colors",
                  limit === l
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                ≤ {fmtLimit(l)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[14px]">
            {selected ? (
              <>
                <span className="font-medium">{selected.name}</span>
                <span className="num ml-3 text-muted-foreground">
                  {[
                    `${selected.metrics.latencyS.toFixed(1)}s`,
                    `${speedup(bench, selected).toFixed(1)}× faster`,
                    `LPIPS ${fmtLpips(lpipsOf(selected))}`,
                  ].join(" · ")}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No measured recipe meets this limit.</span>
            )}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <ResultsTable
          bench={bench}
          limit={limit}
          selectedId={selected?.id ?? null}
          openId={openId}
          onSelect={select}
        />
      </section>

      <section className="mt-14 border-t border-border pt-5">
        <h2 className="text-[16px] font-semibold tracking-tight">Add a recipe</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Found a better optimization combination?{" "}
          <span className="text-foreground">Submit a reproducible recipe through GitHub.</span>
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block rounded-sm border border-foreground/70 px-3 py-1 text-[13px] hover:bg-surface-alt"
        >
          Submit via GitHub ↗
        </a>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Submissions are evaluated under the same model, hardware, workload, and quality protocol.
          The submission unit is a complete recipe.
        </p>
      </section>
    </SiteShell>
  );
}
