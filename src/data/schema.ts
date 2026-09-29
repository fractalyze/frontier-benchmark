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
] as const;
export const STATUSES = ["Verified", "Submitted", "Experimental"] as const;
export const MEASURED_ON = ["public", "held-out"] as const;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected a slug");
const text = z.string().min(1);
// fileUrl() concatenates this onto blob/main/ as-is.
const repoPath = z
  .string()
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))\S+$/, "expected a repo-relative path");
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

export const BenchmarkFileSchema = z
  .object({
    model: text,
    hardware: text,
    protocol: z
      .object({
        version: text,
        resolution: z.string().regex(/^\d+x\d+$/, "expected WxH"),
        batch: posInt,
        steps: posInt,
        precision: text,
      })
      .strict(),
    promptSets: z
      .object({
        // Keys match the MEASURED_ON values so a recipe's measuredOn indexes this object directly.
        public: z.object({ name: text, count: posInt, path: repoPath }).strict(),
        "held-out": z.object({ name: text, count: posInt }).strict(),
      })
      .strict(),
    throughputConcurrency: posInt,
    warmupRuns: z.number().int().nonnegative(),
    baselineRecipe: slug,
  })
  .strict();

export const RecipeFileSchema = z
  .object({
    id: slug,
    engine: z.object({ name: text, version: text }).strict(),
    optimization: z.array(z.object({ technique: z.enum(TECHNIQUES), method: text }).strict()),
    configuration: z.array(text),
    configPath: repoPath.nullable(),
    metrics: z
      .object({
        latencyS: pos,
        throughputImgS: pos,
        peakVramGb: pos,
        lpips: z.object({ mean: nonneg, p95: nonneg }).strict().nullable(),
        psnr: z.object({ mean: pos }).strict().nullable(),
        ssim: z
          .object({ mean: z.number().min(0).max(1) })
          .strict()
          .nullable(),
        imageReward: z.object({ mean: z.number() }).strict(),
      })
      .strict(),
    status: z.enum(STATUSES),
    measuredOn: z.enum(MEASURED_ON),
    date: isoDate,
    commit: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/, "expected a hex sha")
      .nullable(),
    pr: posInt.nullable(),
  })
  .strict();

export type Technique = (typeof TECHNIQUES)[number];
export type VerificationStatus = (typeof STATUSES)[number];
export type MeasuredOn = (typeof MEASURED_ON)[number];
export type BenchmarkFile = z.infer<typeof BenchmarkFileSchema>;
export type RecipeFile = z.infer<typeof RecipeFileSchema>;
