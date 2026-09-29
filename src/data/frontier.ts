/**
 * Inference Frontier data layer.
 * ALL RECIPE NUMBERS ARE DEMO PLACEHOLDERS — not benchmark results.
 * Hierarchy: Recipe → Techniques → Methods → Configuration.
 */

export type Technique =
  | "Step Reduction"
  | "Feature Caching"
  | "Sparse Attention"
  | "Token Pruning"
  | "Quantization"
  | "Kernel Optimization"
  | "Compilation"
  | "Parallelism";

export type VerificationStatus = "Verified" | "Submitted" | "Experimental";

export interface Recipe {
  id: string;
  /** The optimization combination itself is the name. */
  name: string;
  optimization: { technique: Technique; method: string }[];
  configuration: string[];
  latencyS: number;
  lpipsMean: number;
  lpipsP95: number;
  peakVramGb: number;
  status: VerificationStatus;
  configUrl: string;
  commit: string;
  pr: number;
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

export interface Benchmark {
  model: string;
  hardware: string;
  resolution: string;
  batch: number;
  training: string;
  protocol: string;
  date: string;
  baselineLatencyS: number;
  recipes: Recipe[];
}

const gh = "https://github.com/inference-frontier/benchmarks";
const r = (
  id: string,
  name: string,
  optimization: Recipe["optimization"],
  configuration: string[],
  latencyS: number,
  lpipsMean: number,
  lpipsP95: number,
  peakVramGb: number,
  status: VerificationStatus,
  commit: string,
  pr: number,
): Recipe => ({
  id,
  name,
  optimization,
  configuration,
  latencyS,
  lpipsMean,
  lpipsP95,
  peakVramGb,
  status,
  configUrl: `${gh}/blob/main/recipes/${id}/config.yaml`,
  commit,
  pr,
});

const DPC = { technique: "Feature Caching" as const, method: "DPCache" };
const FP8 = { technique: "Quantization" as const, method: "FP8 W8A8" };
const SPA = { technique: "Sparse Attention" as const, method: "SpargeAttn" };
const CMP = { technique: "Compilation" as const, method: "torch.compile" };

/** Only combinations that actually have (demo) data. */
export const BENCHMARKS: Benchmark[] = [
  {
    model: "qwen-image-2.1",
    hardware: "rtx5090",
    resolution: "1024×1024",
    batch: 1,
    training: "No additional training",
    protocol: "protocol v0.3",
    date: "2026-09-21",
    baselineLatencyS: 12.0,
    recipes: [
      r(
        "sglang-default",
        "SGLang Default",
        [],
        ["50 steps · FlowMatch Euler", "BF16"],
        12.0,
        0,
        0,
        23.4,
        "Verified",
        "3f0b1d7",
        1,
      ),
      r(
        "dpcache",
        "DPCache",
        [DPC],
        ["cache interval 3", "warmup 6 steps"],
        6.1,
        0.004,
        0.009,
        24.1,
        "Verified",
        "b72e0c4",
        21,
      ),
      r(
        "fp8",
        "FP8",
        [FP8],
        ["FP8 E4M3 W8A8", "per-channel scales"],
        5.1,
        0.014,
        0.027,
        15.2,
        "Verified",
        "91ac3e2",
        14,
      ),
      r(
        "teacache",
        "TeaCache",
        [{ technique: "Feature Caching", method: "TeaCache" }],
        ["rel_l1_thresh 0.25"],
        4.9,
        0.031,
        0.061,
        23.9,
        "Verified",
        "0d4f8a1",
        17,
      ),
      r(
        "cachedit-fp8",
        "Cache-DiT + FP8",
        [{ technique: "Feature Caching", method: "Cache-DiT" }, FP8],
        ["Fn=8 Bn=0 threshold 0.08", "FP8 E4M3 W8A8"],
        4.3,
        0.012,
        0.024,
        15.6,
        "Verified",
        "c5e2917",
        33,
      ),
      r(
        "teacache-fp8",
        "TeaCache + FP8",
        [{ technique: "Feature Caching", method: "TeaCache" }, FP8],
        ["rel_l1_thresh 0.3", "FP8 E4M3 W8A8"],
        3.6,
        0.052,
        0.098,
        15.4,
        "Submitted",
        "e19b5d0",
        49,
      ),
      r(
        "dpcache-fp8",
        "DPCache + FP8",
        [DPC, FP8],
        ["cache interval 3", "FP8 E4M3 W8A8"],
        2.4,
        0.028,
        0.051,
        15.7,
        "Verified",
        "7a0c3f5",
        41,
      ),
      r(
        "dpcache-fp8-sparge",
        "DPCache + FP8 + SpargeAttn",
        [DPC, FP8, SPA],
        ["cache interval 3", "FP8 E4M3 W8A8", "sparsity 0.6 · block 128"],
        2.0,
        0.041,
        0.074,
        15.8,
        "Verified",
        "f28d6b9",
        52,
      ),
      r(
        "dpcache-fp8-sparge-compile",
        "DPCache + FP8 + SpargeAttn + torch.compile",
        [DPC, FP8, SPA, CMP],
        [
          "cache interval 3",
          "FP8 E4M3 W8A8",
          "sparsity 0.6 · block 128",
          "mode=max-autotune · cudagraphs",
        ],
        1.7,
        0.047,
        0.082,
        15.8,
        "Verified",
        "a41c9e2",
        58,
      ),
      r(
        "steps20-dpcache-fp8-compile",
        "20 steps + DPCache + FP8 + torch.compile",
        [{ technique: "Step Reduction", method: "20-step schedule" }, DPC, FP8, CMP],
        ["20 steps · shifted sigmas", "cache interval 2", "FP8 E4M3 W8A8", "mode=max-autotune"],
        1.2,
        0.086,
        0.14,
        15.7,
        "Experimental",
        "d93a01e",
        63,
      ),
    ],
  },
];

export const findBenchmark = (model: string, hardware: string) =>
  BENCHMARKS.find((b) => b.model === model && b.hardware === hardware);
export const modelBySlug = (s: string) => MODELS.find((m) => m.slug === s);
export const hardwareBySlug = (s: string) => HARDWARE.find((h) => h.slug === s);

export const speedup = (b: Benchmark, rec: Recipe) => b.baselineLatencyS / rec.latencyS;

export function paretoFrontier(recipes: Recipe[]) {
  const sorted = [...recipes].sort((a, b) => a.latencyS - b.latencyS || a.lpipsMean - b.lpipsMean);
  const out: Recipe[] = [];
  let best = Infinity;
  for (const rec of sorted)
    if (rec.lpipsMean < best) {
      out.push(rec);
      best = rec.lpipsMean;
    }
  return out;
}

export const fastestUnder = (recipes: Recipe[], limit: number) =>
  recipes.filter((x) => x.lpipsMean <= limit).sort((a, b) => a.latencyS - b.latencyS)[0] ?? null;

export const fmtLpips = (v: number) => (v === 0 ? "—" : v.toFixed(3).replace(/^0/, ""));
