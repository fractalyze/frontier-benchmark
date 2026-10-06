/**
 * zod schemas for data/benchmarks/**. Types are inferred from here — never hand-duplicated.
 * Cross-file rules (baseline, unique ids, known slugs) live in the loader, not here.
 */
import { z } from "zod";

export const TECHNIQUES = [
  "Step Reduction",
  "Feature Caching",
  "Sparse Attention",
  "Token Pruning",
  "Quantization",
  "Kernel Optimization",
  "Compilation",
  "Parallelism",
  "Stage Scheduling",
] as const;
export const STATUSES = ["Verified", "Submitted", "Experimental"] as const;
/** What a benchmark's output is; decides the quality and latency axes (see WORKLOADS). */
export const WORKLOAD_SLUGS = ["image", "video", "speech"] as const;
export const MEASURED_ON = ["public", "held-out"] as const;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected a slug");
const text = z.string().min(1);
// fileUrl() concatenates this onto blob/main/ as-is.
const repoPath = z
  .string()
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))\S*[^\s/]$/, "expected a repo-relative file path");
const posInt = z.number().int().positive();
const pos = z.number().positive();
const nonneg = z.number().nonnegative();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const t = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(s);
  }, "not a calendar date");

/** How an image or a video is generated; every recipe on the page runs under it. */
const imageProtocol = z
  .object({
    version: text,
    resolution: z.string().regex(/^\d+x\d+$/, "expected WxH"),
    batch: posInt,
    steps: posInt,
    precision: text,
    guidance: nonneg,
    attention: text,
    offload: text,
  })
  .strict();

/** How a spoken reply is generated: no resolution, steps or guidance. */
const speechProtocol = z
  .object({
    version: text,
    batch: posInt,
    precision: text,
    /** Sampling of the reply, e.g. "greedy (...), seed 42". */
    decoding: text,
    /** What a request returns, e.g. "text + 24 kHz speech, streamed". */
    output: text,
  })
  .strict();

const benchmarkFields = {
  model: text,
  hardware: text,
  promptSets: z
    .object({
      // Keys match the MEASURED_ON values so a recipe's measuredOn indexes this object directly.
      public: z.object({ name: text, count: posInt, path: repoPath }).strict(),
      "held-out": z.object({ name: text, count: posInt }).strict().nullable(),
    })
    .strict(),
  /** How latency was taken, in words; the harness fills it in. */
  timing: text,
  baselineRecipe: slug,
};

/** The protocol's shape depends on the workload, so the file is a union on `workload`. */
export const BenchmarkFileSchema = z.discriminatedUnion("workload", [
  z
    .object({ ...benchmarkFields, workload: z.enum(["image", "video"]), protocol: imageProtocol })
    .strict(),
  z
    .object({ ...benchmarkFields, workload: z.literal("speech"), protocol: speechProtocol })
    .strict(),
]);

export const RecipeFileSchema = z
  .object({
    id: slug,
    /** Display name; omitted, the methods are joined with " + ". */
    name: text.optional(),
    engine: z.object({ name: text, version: text, url: z.string().url().nullable() }).strict(),
    optimization: z.array(z.object({ technique: z.enum(TECHNIQUES), method: text }).strict()),
    configuration: z.array(text),
    configPath: repoPath.nullable(),
    metrics: z
      .object({
        latencyS: pos,
        peakVramGb: pos.nullable(),
        /** Image / video quality loss vs the baseline output (mean and max over the set). */
        lpips: z.object({ mean: nonneg, max: nonneg }).strict().nullable(),
        /**
         * Speech quality loss vs the baseline: the baseline's replies forced through the recipe's
         * decode, the share of tokens where the recipe's own greedy choice differs (bench/agree.py).
         */
        disagree: z.object({ mean: nonneg, max: nonneg }).strict().nullable().optional(),
        /** Speech intelligibility, shown only: ASR WER of each reply's audio vs its own text. */
        asrWer: z.object({ mean: nonneg, max: nonneg }).strict().nullable().optional(),
        psnr: z.object({ mean: pos, min: pos }).strict().nullable(),
        ssim: z
          .object({ mean: z.number().min(0).max(1) })
          .strict()
          .nullable(),
        imageReward: z.object({ mean: z.number() }).strict().nullable(),
      })
      .strict(),
    status: z.enum(STATUSES),
    measuredOn: z.enum(MEASURED_ON),
    date: isoDate,
    /** Where the numbers were reported (a PR, a report); null until measured by this repo's harness. */
    sourceUrl: z.string().url().nullable(),
    pr: posInt.nullable(),
  })
  .strict();

export type Technique = (typeof TECHNIQUES)[number];
export type VerificationStatus = (typeof STATUSES)[number];
export type MeasuredOn = (typeof MEASURED_ON)[number];
export type WorkloadSlug = (typeof WORKLOAD_SLUGS)[number];
export type BenchmarkFile = z.infer<typeof BenchmarkFileSchema>;
export type RecipeFile = z.infer<typeof RecipeFileSchema>;
