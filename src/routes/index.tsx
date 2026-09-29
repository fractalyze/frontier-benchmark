import { createFileRoute, Link } from "@tanstack/react-router";
import { BENCHMARKS, MODELS } from "@/data/frontier";
import { REPO_URL } from "@/data/site";
import { BenchmarkCard } from "@/components/frontier/BenchmarkCard";
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
  "Baseline: the engine's default run — BF16, 50 steps, no cache, no quantization. Every recipe is compared against its images.",
  "Quality: LPIPS, PSNR and SSIM against the baseline images plus ImageReward, over 100 fixed prompts. LPIPS is the axis on every chart.",
  "Speed: one image from prompt to output (median after warmup), and images per second with 4 concurrent requests.",
  "Verified means re-measured by the maintainers on a private held-out prompt set; Submitted means measured on the public prompt set only.",
];

const Label = ({ children }: { children: string }) => (
  <h2 className="border-b border-border-strong pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
    {children}
  </h2>
);

function Index() {
  const groups = [...new Set(MODELS.map((m) => m.group))].filter((g) =>
    BENCHMARKS.some((b) => MODELS.find((m) => m.slug === b.model)?.group === g),
  );
  return (
    <SiteShell>
      <div className="max-w-xl pt-10 text-[15px]">
        <p>The fastest way to run each model on each GPU without losing quality.</p>
        <p className="mt-1 text-muted-foreground">
          Every number is measured on the same machine, with the same prompts, against the same
          baseline.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g} className="mt-10">
          <Label>{g}</Label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODELS.filter((m) => m.group === g)
              .flatMap((m) => BENCHMARKS.filter((b) => b.model === m.slug))
              .map((b) => (
                <Link
                  key={`${b.model}/${b.hardware}`}
                  to="/$model/$hardware"
                  params={{ model: b.model, hardware: b.hardware }}
                  className="block rounded-sm border border-border hover:bg-surface-alt"
                >
                  <BenchmarkCard bench={b} />
                </Link>
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
          One pull request adds one recipe config. Maintainers run it on the reference machine and
          publish the result.{" "}
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
