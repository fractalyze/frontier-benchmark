/**
 * Inference Frontier data layer.
 * Numbers live in data/benchmarks/<model>/<hardware>/{benchmark.json,recipes/<id>.json},
 * validated with the zod schemas in ./schema at load time.
 * Hierarchy: Recipe → Techniques → Methods → Configuration.
 */
import {
  BenchmarkFileSchema,
  RecipeFileSchema,
  type BenchmarkFile,
  type RecipeFile,
} from "./schema";
import type { z } from "zod";

export type { Technique, VerificationStatus, MeasuredOn } from "./schema";

export interface Recipe extends RecipeFile {
  /** Methods joined with " + "; "Baseline" for the reference recipe. */
  name: string;
}

export interface Benchmark extends BenchmarkFile {
  recipes: Recipe[];
  baseline: Recipe;
  /** Max recipe date. */
  updated: string;
}

export interface ModelInfo {
  slug: string;
  name: string;
  group: "Image" | "Video";
}
export interface HardwareInfo {
  slug: string;
  name: string;
  group: "Consumer" | "Datacenter";
}

/** Catalogue of what the site knows about; a benchmark must reference entries from here. */
export const MODELS: ModelInfo[] = [
  { slug: "qwen-image-2.1", name: "Qwen-Image 2.1", group: "Image" },
  { slug: "qwen-image-2512", name: "Qwen-Image 2512", group: "Image" },
  { slug: "flux-1", name: "FLUX.1", group: "Image" },
  { slug: "flux-2", name: "FLUX.2", group: "Image" },
  { slug: "z-image", name: "Z-Image", group: "Image" },
  { slug: "ideogram-4", name: "Ideogram 4", group: "Image" },
  { slug: "wan", name: "Wan", group: "Video" },
  { slug: "ltx", name: "LTX", group: "Video" },
];

export const HARDWARE: HardwareInfo[] = [
  { slug: "rtx5090", name: "RTX 5090", group: "Consumer" },
  { slug: "h100", name: "H100", group: "Datacenter" },
  { slug: "h200", name: "H200", group: "Datacenter" },
  { slug: "b200", name: "B200", group: "Datacenter" },
];

const err = (file: string, msg: string) => new Error(`${file}: ${msg}`);

function parse<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  const issues = res.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
  throw err(file, `invalid\n  ${issues.join("\n  ")}`);
}

const recipeName = (r: RecipeFile) =>
  r.optimization.length ? r.optimization.map((o) => o.method).join(" + ") : "Baseline";

/**
 * Pure "files → benchmarks" builder. Keys are file paths (any prefix), values the parsed JSON;
 * files are grouped by the directory that holds benchmark.json.
 */
export function buildBenchmarks(files: Record<string, unknown>): Benchmark[] {
  const dirs = new Map<string, { bench?: string; recipes: string[] }>();
  const group = (dir: string) => dirs.get(dir) ?? dirs.set(dir, { recipes: [] }).get(dir)!;
  for (const file of Object.keys(files)) {
    const m = /^(.*)\/(benchmark\.json|recipes\/[^/]+\.json)$/.exec(file);
    if (!m) throw err(file, "not benchmark.json or recipes/<id>.json");
    const g = group(m[1]!);
    if (m[2] === "benchmark.json") g.bench = file;
    else g.recipes.push(file);
  }

  const out: Benchmark[] = [];
  const seenPairs = new Set<string>();
  for (const [dir, g] of dirs) {
    if (!g.bench) throw err(`${dir}/benchmark.json`, "missing");
    const bench = parse(BenchmarkFileSchema, files[g.bench], g.bench);
    if (!MODELS.some((x) => x.slug === bench.model))
      throw err(g.bench, `unknown model "${bench.model}"`);
    if (!HARDWARE.some((x) => x.slug === bench.hardware))
      throw err(g.bench, `unknown hardware "${bench.hardware}"`);
    // The directory is the URL; a mis-copied folder must not silently publish under another pair.
    if (!dir.endsWith(`/${bench.model}/${bench.hardware}`))
      throw err(
        g.bench,
        `directory does not match model/hardware "${bench.model}/${bench.hardware}"`,
      );
    const pair = `${bench.model}/${bench.hardware}`;
    if (seenPairs.has(pair)) throw err(g.bench, `duplicate benchmark for "${pair}"`);
    seenPairs.add(pair);

    if (!g.recipes.includes(`${dir}/recipes/${bench.baselineRecipe}.json`))
      throw err(g.bench, `baselineRecipe "${bench.baselineRecipe}" has no recipe file`);

    const seen = new Set<string>();
    const recipes = g.recipes.sort().map((file): Recipe => {
      const r = parse(RecipeFileSchema, files[file], file);
      const stem = file.slice(file.lastIndexOf("/") + 1, -".json".length);
      if (seen.has(r.id)) throw err(file, `duplicate recipe id "${r.id}"`);
      seen.add(r.id);
      if (r.id !== stem) throw err(file, `id "${r.id}" does not match filename`);
      const isBaseline = r.id === bench.baselineRecipe;
      const { lpips, psnr, ssim } = r.metrics;
      if (isBaseline && (r.optimization.length || lpips || psnr || ssim))
        throw err(file, "baseline must have optimization = [] and lpips/psnr/ssim = null");
      if (!isBaseline) {
        const missing = Object.entries({ optimization: r.optimization.length, lpips })
          .filter(([, v]) => !v)
          .map(([k]) => k);
        if (missing.length) throw err(file, `non-baseline recipe is missing ${missing.join(", ")}`);
      }
      return { ...r, name: recipeName(r) };
    });
    const dates = recipes.map((r) => r.date).sort();
    out.push({
      ...bench,
      recipes,
      baseline: recipes.find((r) => r.id === bench.baselineRecipe)!,
      updated: dates.at(-1)!,
    });
  }
  return out.sort((a, b) => a.model.localeCompare(b.model) || a.hardware.localeCompare(b.hardware));
}

/** Only combinations that actually have data on disk. */
export const BENCHMARKS: Benchmark[] = buildBenchmarks(
  import.meta.glob(["/data/benchmarks/*/*/benchmark.json", "/data/benchmarks/*/*/recipes/*.json"], {
    eager: true,
    import: "default",
  }),
);

export const findBenchmark = (model: string, hardware: string) =>
  BENCHMARKS.find((b) => b.model === model && b.hardware === hardware);
export const modelBySlug = (s: string) => MODELS.find((m) => m.slug === s);
export const hardwareBySlug = (s: string) => HARDWARE.find((h) => h.slug === s);

/** Baseline (lpips null) counts as zero loss. */
export const lpipsOf = (rec: Recipe) => rec.metrics.lpips?.mean ?? 0;

export const speedup = (b: Benchmark, rec: Recipe) =>
  b.baseline.metrics.latencyS / rec.metrics.latencyS;

export function paretoFrontier(recipes: Recipe[]) {
  const sorted = [...recipes].sort(
    (a, b) => a.metrics.latencyS - b.metrics.latencyS || lpipsOf(a) - lpipsOf(b),
  );
  const out: Recipe[] = [];
  let best = Infinity;
  for (const rec of sorted)
    if (lpipsOf(rec) < best) {
      out.push(rec);
      best = lpipsOf(rec);
    }
  return out;
}

export const fastestUnder = (recipes: Recipe[], limit: number) =>
  recipes
    .filter((x) => lpipsOf(x) <= limit)
    .sort((a, b) => a.metrics.latencyS - b.metrics.latencyS)[0] ?? null;

/** Quality-limit buttons on the benchmark page (the ladder keeps its own coarser default). */
export const QUALITY_LIMITS = [0.01, 0.03, 0.05, 0.1];

export const ladder = (b: Benchmark, limits: number[] = [0.01, 0.05, 0.1]) =>
  limits.map((limit) => ({ limit, recipe: fastestUnder(b.recipes, limit) }));

export const fmtLpips = (v: number | null | undefined) =>
  v ? v.toFixed(3).replace(/^0/, "") : "—";
/** Quality limits are coarse (.01/.05/.10), so two decimals; fmtLpips's three are for measurements. */
export const fmtLimit = (v: number) => v.toFixed(2).replace(/^0/, "");
export const fmtResolution = (r: string) => r.replace("x", "×");
