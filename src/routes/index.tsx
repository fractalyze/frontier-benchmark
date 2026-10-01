import { createFileRoute, Link } from "@tanstack/react-router";
import { BENCHMARKS, MODELS, WORKLOAD_SLUGS, WORKLOADS } from "@/data/frontier";
import { REPO_URL } from "@/data/site";
import { ModelCard } from "@/components/frontier/ModelCard";
import { SiteShell } from "@/components/frontier/SiteShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inference Frontier — latency-quality benchmarks for generative inference" },
      {
        name: "description",
        content:
          "Open archive of Pareto frontiers: the best latency-quality tradeoff of optimization recipes for each model × hardware.",
      },
      { property: "og:title", content: "Inference Frontier" },
      {
        property: "og:description",
        content:
          "The best measured latency-quality tradeoffs for generative image and video inference.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const METHOD = [
  "Baseline: the engine's native BF16 run at the page's step count. Every recipe is compared to its output.",
  `Quality: a loss against the baseline output for the same prompt and seed, over a fixed prompt set — ${WORKLOAD_SLUGS.map(
    (w) => `${WORKLOADS[w].quality.name} for ${w}`,
  ).join(", ")}.`,
  "Speed: latency of a single request, median after warmup — seconds per image or clip, milliseconds to first audio for speech.",
  "Verified: re-measured by the maintainers on a private held-out prompt set.",
];

const Label = ({ children }: { children: string }) => (
  <h2 className="border-b border-border-strong pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
    {children}
  </h2>
);

function Index() {
  const sections = WORKLOAD_SLUGS.filter((w) => BENCHMARKS.some((b) => b.workload === w));
  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl pt-14 text-center text-[15px]">
        <p className="text-muted-foreground">
          For one model on one GPU, every optimization recipe is measured against the baseline. The
          frontier is the recipe that solves
        </p>
        <div className="num mt-6 inline-grid grid-cols-[auto_auto] gap-x-6 gap-y-2 rounded-sm border border-border bg-surface-alt px-8 py-5 text-left text-[17px]">
          <span className="text-[11px] leading-[1.9] font-medium tracking-wider text-muted-foreground uppercase">
            minimize
          </span>
          <span>latency(recipe)</span>
          <span className="text-[11px] leading-[1.9] font-medium tracking-wider text-muted-foreground uppercase">
            subject to
          </span>
          <span>loss(recipe, baseline) ≤ ε</span>
        </div>
        <p className="mt-5 text-muted-foreground">
          for the quality loss ε you choose — LPIPS for image and video, word-error-rate increase
          for speech.
        </p>
      </section>

      {sections.map((w) => (
        <section key={w} className="mt-10">
          <Label>{WORKLOADS[w].label}</Label>
          <p className="num mt-2 text-[12px] text-muted-foreground">{WORKLOADS[w].caption}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODELS.filter((m) => m.workload === w)
              .map((m) => ({ m, benches: BENCHMARKS.filter((b) => b.model === m.slug) }))
              .filter(({ benches }) => benches.length)
              .map(({ m, benches }) => (
                <ModelCard
                  key={m.slug}
                  model={m}
                  benches={benches}
                  renderLink={(b, children) => (
                    <Link to="/$model/$hardware" params={{ model: b.model, hardware: b.hardware }}>
                      {children}
                    </Link>
                  )}
                />
              ))}
          </div>
        </section>
      ))}

      <section id="methodology" className="mt-14 scroll-mt-6">
        <Label>How it's measured</Label>
        <ul className="mt-3 max-w-2xl list-disc space-y-1.5 pl-5 text-[14px]">
          {METHOD.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section id="submit" className="mt-14 scroll-mt-6">
        <Label>Submit a recipe</Label>
        <p className="mt-3 max-w-2xl text-[14px]">
          One pull request, one recipe config; maintainers measure and publish it.{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-primary hover:underline"
          >
            GitHub ↗
          </a>
        </p>
      </section>
    </SiteShell>
  );
}
