import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  fastestUnder,
  findBenchmark,
  fmtLatency,
  fmtLoss,
  hardwareBySlug,
  lossOf,
  modelBySlug,
  protocolRows,
  speedup,
  workloadOf,
  type Benchmark,
} from "@/data/frontier";
import { REPO_URL } from "@/data/site";
import { SiteShell } from "@/components/frontier/SiteShell";
import { IdentitySelect } from "@/components/frontier/IdentitySelect";
import { LatencyFigure } from "@/components/frontier/LatencyFigure";
import { ParetoFigure } from "@/components/frontier/ParetoFigure";
import { ResultsTable } from "@/components/frontier/ResultsTable";

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
  component: BenchmarkRoute,
});

/** Keyed by workload: moving to a page with another quality scale starts from its own limit. */
function BenchmarkRoute() {
  const { bench } = Route.useLoaderData();
  return <BenchmarkPage key={bench.workload} bench={bench} />;
}

function BenchmarkPage({ bench }: { bench: Benchmark }) {
  const [limit, setLimit] = useState(workloadOf(bench).quality.defaultLimit);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const best = fastestUnder(bench, limit);
  const { quality, chart } = workloadOf(bench);
  const Figure = chart === "latency" ? LatencyFigure : ParetoFigure;
  const selected = bench.recipes.find((r) => r.id === picked) ?? best;

  // The chart highlights a recipe; a table row also opens its detail dialog.
  const highlight = (id: string) => setPicked(id);
  const open = (id: string) => {
    setPicked(id);
    setOpenId(id);
  };
  const changeLimit = (l: number) => {
    setLimit(l);
    setPicked(null);
  };

  return (
    <SiteShell>
      <section className="pt-8">
        <IdentitySelect model={bench.model} hardware={bench.hardware} />
        <dl className="num mt-4 flex flex-wrap gap-x-7 gap-y-2">
          {[
            ...protocolRows(bench),
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
        <Figure
          bench={bench}
          limit={limit}
          selectedId={selected?.id ?? null}
          onSelect={highlight}
          onLimitChange={changeLimit}
        />

        <div className="mt-3 border-t border-border pt-4">
          <p className="text-[12px] text-muted-foreground">
            {chart === "latency"
              ? "Set the quality gate with − and +. The fastest recipe that passes it is selected; recipes that fail it are greyed out."
              : "Drag the dashed line (or focus its grip and use the arrow keys) to set the quality limit. The fastest recipe within it is selected; recipes above it are greyed out."}
          </p>
          {selected ? (
            <div className="mt-3 border-l-2 border-primary bg-surface-alt py-3 pr-4 pl-4">
              <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Fastest within {quality.name} ≤ {fmtLoss(bench, limit)}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span className="text-[20px] font-semibold tracking-tight">{selected.name}</span>
                <span className="num text-[16px]">
                  {fmtLatency(bench, selected.metrics.latencyS)}
                  <span className="text-muted-foreground"> · </span>
                  {speedup(bench, selected).toFixed(1)}× faster
                  <span className="text-muted-foreground"> · </span>
                  {quality.name} {fmtLoss(bench, lossOf(bench, selected))}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-muted-foreground">
              No measured recipe meets {quality.name} ≤ {fmtLoss(bench, limit)}.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <ResultsTable
          bench={bench}
          limit={limit}
          selectedId={selected?.id ?? null}
          openId={openId}
          onSelect={open}
          onClose={() => setOpenId(null)}
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
