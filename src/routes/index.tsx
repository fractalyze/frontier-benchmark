import { createFileRoute, Link } from "@tanstack/react-router";
import { BENCHMARKS, HARDWARE, MODELS } from "@/data/frontier";
import { SiteShell } from "@/components/frontier/SiteShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inference Frontier — latency-quality benchmarks for generative inference" },
      {
        name: "description",
        content: "Open archive of Pareto frontiers: the best latency-quality tradeoff of optimization recipes for each model × hardware.",
      },
      { property: "og:title", content: "Inference Frontier" },
      { property: "og:description", content: "The best measured latency-quality tradeoffs for generative image and video inference." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const withData = MODELS.filter((m) => BENCHMARKS.some((b) => b.model === m.slug));
  const groups = [...new Set(withData.map((m) => m.group))];
  return (
    <SiteShell>
      <p className="max-w-xl pt-10 text-[15px] text-muted-foreground">
        Each benchmark is a Pareto frontier of complete optimization recipes, local to one model, one GPU, and one protocol.
      </p>
      {groups.map((g) => (
        <section key={g} className="mt-10">
          <h2 className="border-b border-border-strong pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{g}</h2>
          {withData.filter((m) => m.group === g).map((m) => (
            <div key={m.slug} className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] border-b border-border py-2.5 text-[14px]">
              <span className="font-medium">{m.name}</span>
              <span className="flex gap-3">
                {HARDWARE.filter((h) => BENCHMARKS.some((b) => b.model === m.slug && b.hardware === h.slug)).map((h) => (
                  <Link key={h.slug} to="/$model/$hardware" params={{ model: m.slug, hardware: h.slug }} className="text-primary hover:underline">
                    {h.name}
                  </Link>
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}
    </SiteShell>
  );
}
