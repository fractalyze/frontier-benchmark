/**
 * Inference Frontier data layer.
 * Numbers live in data/benchmarks/<model>/<hardware>/{benchmark.json,recipes/<id>.json},
 * validated with the zod schemas in ./schema at load time.
 * Hierarchy: Recipe → Techniques → Methods → Configuration.
 */
import {
  BenchmarkFileSchema,
  RecipeFileSchema,
  WORKLOAD_SLUGS,
  type BenchmarkFile,
  type RecipeFile,
  type WorkloadSlug,
} from "./schema";
import type { z } from "zod";

export type { Technique, VerificationStatus, MeasuredOn, WorkloadSlug } from "./schema";
export { WORKLOAD_SLUGS };

export interface Recipe extends RecipeFile {
  /** The file's `name`, else its methods joined with " + "; "Baseline" for the reference recipe. */
  name: string;
}

/** A benchmark.json plus its recipes; a union on `workload`, like the file. */
export type Benchmark = BenchmarkFile & {
  recipes: Recipe[];
  baseline: Recipe;
  /** Max recipe date. */
  updated: string;
};

export interface ModelInfo {
  slug: string;
  name: string;
  workload: WorkloadSlug;
}

/**
 * A workload is what a benchmark produces, and it fixes the two axes the frontier is drawn on:
 * a quality loss against the baseline (the ε axis) and a latency. The main page has one
 * section per workload; cards, charts and tables take their labels and formats from here.
 */
export interface Workload {
  slug: WorkloadSlug;
  /** Section heading on the main page. */
  label: string;
  /** One line under the heading: what the two axes are. */
  caption: string;
  quality: {
    /** Key under recipe.metrics holding `{ mean, max }`. */
    key: "lpips" | "wer";
    name: string;
    /** How the loss is measured, for the methodology section. */
    method: string;
    fmt: (v: number | null | undefined) => string;
    /** Chart y-axis title, and how a nonzero y tick is labelled. */
    axis: string;
    tick: (v: number) => string;
    /** Chart scale: y tick spacing, and the smallest top of the y axis. */
    step: number;
    span: number;
    /** The limit a benchmark page opens with. */
    defaultLimit: number;
    /** Arrow keys move the limit by this much; a drag rounds to `digits` decimals. */
    limitStep: number;
    digits: number;
    /** Lowest limit the grip allows; the bottom of the y axis also bounds it. */
    limitMin: number;
  };
  /**
   * How the page draws its recipes. "pareto": latency × loss scatter with a draggable limit
   * line. "latency": one bar per recipe, fastest first, the loss only a pass/fail gate; for a
   * loss too coarse to rank recipes by (speech ΔWER rests on three distinct replies).
   */
  chart: "pareto" | "latency";
  /** PSNR, SSIM and ImageReward apply: the recipe dialog shows their tiles. */
  imageScores: boolean;
  latency: {
    /** Chart axis label. */
    axis: string;
    fmt: (seconds: number) => string;
    /** x tick spacing in seconds, and how a tick is labelled in the axis label's unit. */
    step: number;
    tick: (seconds: number) => string;
  };
}

const fmtSeconds = (s: number) => `${s.toFixed(1)}s`;
const fmtMillis = (s: number) => `${Math.round(s * 1000)} ms`;
const IMAGE_SCALE = {
  step: 0.02,
  span: 0.1,
  defaultLimit: 0.05,
  limitStep: 0.005,
  digits: 3,
  limitMin: 0.001,
  axis: "Quality loss (LPIPS)",
  tick: (v: number) => fmtLpips(v),
};
const SECONDS_AXIS = { axis: "E2E latency (s)", fmt: fmtSeconds, step: 2, tick: String };

export const WORKLOADS: Record<WorkloadSlug, Workload> = {
  image: {
    slug: "image",
    label: "Image models",
    caption: "seconds per image · LPIPS vs baseline",
    quality: {
      key: "lpips",
      name: "LPIPS",
      method: "LPIPS (and PSNR) against the baseline image for the same prompt and seed.",
      fmt: (v) => fmtLpips(v),
      ...IMAGE_SCALE,
    },
    chart: "pareto",
    imageScores: true,
    latency: SECONDS_AXIS,
  },
  video: {
    slug: "video",
    label: "Video models",
    caption: "seconds per clip · LPIPS vs baseline",
    quality: {
      key: "lpips",
      name: "LPIPS",
      method: "LPIPS against the baseline clip for the same prompt and seed, averaged over frames.",
      fmt: (v) => fmtLpips(v),
      ...IMAGE_SCALE,
    },
    chart: "pareto",
    imageScores: true,
    latency: SECONDS_AXIS,
  },
  speech: {
    slug: "speech",
    label: "Speech models",
    caption: "ms to first audio · ΔWER vs baseline",
    quality: {
      key: "wer",
      name: "ΔWER",
      method:
        "each reply's audio is transcribed (Qwen3-ASR-1.7B) and scored against that reply's own text; ΔWER is the recipe's word-weighted WER minus the baseline's over the same prompts, negative when the recipe makes fewer errors.",
      fmt: (v) => fmtPp(v),
      axis: "Quality loss (ΔWER, pp)",
      // ticks every half point: "+0.5", "−0.5"; the unit is in the axis title
      tick: (v) => fmtPp(v).replace(/(\.\d)0 pp$/, "$1"),
      // ΔWER is a few tenths of a percentage point either side of zero.
      step: 0.005,
      span: 0.015,
      defaultLimit: 0.005,
      limitStep: 0.001,
      digits: 4,
      limitMin: -Infinity,
    },
    chart: "latency",
    imageScores: false,
    latency: {
      axis: "Time to first audio (ms)",
      fmt: fmtMillis,
      step: 0.025,
      tick: (s) => String(Math.round(s * 1000)),
    },
  },
};
export interface HardwareInfo {
  slug: string;
  name: string;
  group: "Consumer" | "Datacenter";
}

/** Catalogue of what the site knows about; a benchmark must reference entries from here. */
export const MODELS: ModelInfo[] = [
  { slug: "qwen-image-2.1", name: "Qwen-Image 2.1", workload: "image" },
  { slug: "qwen-image-2512", name: "Qwen-Image 2512", workload: "image" },
  { slug: "flux-1", name: "FLUX.1", workload: "image" },
  { slug: "flux-2-klein-4b", name: "FLUX.2 [klein] 4B", workload: "image" },
  { slug: "flux-2", name: "FLUX.2", workload: "image" },
  { slug: "z-image", name: "Z-Image", workload: "image" },
  { slug: "ideogram-4", name: "Ideogram 4", workload: "image" },
  { slug: "wan", name: "Wan", workload: "video" },
  { slug: "ltx", name: "LTX", workload: "video" },
  { slug: "qwen3-omni", name: "Qwen3-Omni", workload: "speech" },
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
  r.optimization.length ? (r.name ?? r.optimization.map((o) => o.method).join(" + ")) : "Baseline";

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
    const model = MODELS.find((x) => x.slug === bench.model);
    if (!model) throw err(g.bench, `unknown model "${bench.model}"`);
    if (model.workload !== bench.workload)
      throw err(
        g.bench,
        `workload "${bench.workload}" but ${bench.model} is a ${model.workload} model`,
      );
    const quality = WORKLOADS[bench.workload].quality.key;
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
      const { psnr, ssim } = r.metrics;
      const loss = r.metrics[quality];
      if (isBaseline && (r.optimization.length || loss || psnr || ssim))
        throw err(file, `baseline must have optimization = [] and ${quality}/psnr/ssim = null`);
      if (isBaseline && r.name !== undefined) throw err(file, "baseline is always named Baseline");
      if (!isBaseline) {
        const missing = Object.entries({ optimization: r.optimization.length, [quality]: loss })
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

export const workloadOf = (b: Benchmark) => WORKLOADS[b.workload];

/** The recipe's quality loss on the benchmark's axis; the baseline (null) counts as zero. */
export const lossOf = (b: Benchmark, rec: Recipe) =>
  rec.metrics[workloadOf(b).quality.key]?.mean ?? 0;
export const fmtLoss = (b: Benchmark, v: number | null | undefined) => workloadOf(b).quality.fmt(v);
export const fmtLatency = (b: Benchmark, seconds: number) => workloadOf(b).latency.fmt(seconds);

export const speedup = (b: Benchmark, rec: Recipe) =>
  b.baseline.metrics.latencyS / rec.metrics.latencyS;

/** Recipes sorted by latency whose loss strictly improves on every faster one; ends at the baseline. */
export function paretoFrontier(b: Benchmark) {
  const loss = (r: Recipe) => lossOf(b, r);
  const sorted = [...b.recipes].sort(
    (a, c) => a.metrics.latencyS - c.metrics.latencyS || loss(a) - loss(c),
  );
  const out: Recipe[] = [];
  let best = Infinity;
  for (const rec of sorted)
    if (loss(rec) < best) {
      out.push(rec);
      best = loss(rec);
    }
  return out;
}

export const fastestUnder = (b: Benchmark, limit: number) =>
  b.recipes
    .filter((x) => lossOf(b, x) <= limit)
    .sort((a, c) => a.metrics.latencyS - c.metrics.latencyS)[0] ?? null;

export const fmtLpips = (v: number | null | undefined) =>
  v ? v.toFixed(3).replace(/^0/, "") : "—";
export const fmtResolution = (r: string) => r.replace("x", "×");
/** A signed fraction in percentage points: +1.05 pp, −0.58 pp; exactly zero is "0", null "—". */
export const fmtPp = (v: number | null | undefined) =>
  v == null ? "—" : v === 0 ? "0" : `${v > 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)} pp`;

/** The protocol as label/value pairs for the benchmark page header; each workload has its own. */
export function protocolRows(b: Benchmark): [string, string | number][] {
  if (b.workload === "speech") {
    const s = b.protocol;
    return [
      ["Output", s.output],
      ["Batch", s.batch],
      ["Precision", s.precision],
      ["Decoding", s.decoding],
    ];
  }
  const i = b.protocol;
  return [
    ["Resolution", fmtResolution(i.resolution)],
    ["Batch", i.batch],
    ["Steps", i.steps],
    ["Precision", i.precision],
    ["Guidance", i.guidance],
    ["Attention", i.attention],
    ["Offload", i.offload],
  ];
}
