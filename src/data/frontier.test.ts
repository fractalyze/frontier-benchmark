import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  fastestUnder,
  findBenchmark,
  fmtLatency,
  fmtLoss,
  fmtLpips,
  fmtPct,
  lossOf,
  paretoFrontier,
  protocolRows,
  speedup,
  WORKLOADS,
  buildBenchmarks,
} from "@/data/frontier";

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;
const { recipes } = bench;
const byId = (id: string) => recipes.find((x) => x.id === id)!;

describe("BENCHMARKS (loaded from data/benchmarks via import.meta.glob)", () => {
  it("loads the qwen-image-2.1 / rtx5090 benchmark with its 10 recipes", () => {
    expect(BENCHMARKS.map((b) => `${b.model}/${b.hardware}`)).toEqual([
      "flux-2-klein-4b/rtx5090",
      "qwen-image-2.1/rtx5090",
      "qwen3-omni/rtx5090",
    ]);
    expect(bench.model).toBe("qwen-image-2.1");
    expect(bench.hardware).toBe("rtx5090");
    expect(recipes).toHaveLength(10);
  });

  it("loads the flux-2-klein-4b / rtx5090 benchmark with its 4 recipes", () => {
    const flux = findBenchmark("flux-2-klein-4b", "rtx5090")!;
    expect(flux.baseline.id).toBe("sglang-native");
    expect(flux.recipes).toHaveLength(4);
    expect(flux.protocol).toMatchObject({ steps: 50 });
  });

  it("loads the qwen3-omni / rtx5090 speech benchmark with its 3 recipes", () => {
    const omni = findBenchmark("qwen3-omni", "rtx5090")!;
    expect(omni.workload).toBe("speech");
    expect(omni.baseline.id).toBe("vllm-omni-native");
    expect(omni.recipes.map((r) => r.id)).toEqual([
      "deterministic-marlin",
      "kernels",
      "vllm-omni-native",
    ]);
    expect(omni.recipes.every((r) => r.status === "Verified" && r.measuredOn === "held-out")).toBe(
      true,
    );
    expect(omni.promptSets["held-out"]).toEqual({ name: "speech-heldout-v1", count: 20 });
    expect(omni.updated).toBe("2026-10-06");
  });

  it("derives baseline and updated", () => {
    expect(bench.baseline.id).toBe("sglang-native");
    expect(bench.baseline.metrics.latencyS).toBe(13.578);
    expect(bench.updated).toBe("2026-10-01");
  });

  it("derives names from methods", () => {
    expect(byId("sglang-native").name).toBe("Baseline");
    expect(byId("dpcache-k20").name).toBe("DPCache K=20");
    expect(byId("cachedit-stock").name).toBe("Cache-DiT stock");
    // a recipe file's own name wins over its methods
    const omni = findBenchmark("qwen3-omni", "rtx5090")!;
    expect(omni.recipes.map((r) => r.name)).toEqual([
      "Deterministic Marlin",
      "Megakernels",
      "Baseline",
    ]);
  });
});

describe("lossOf", () => {
  it("reads the workload's quality key and treats the baseline's null as zero loss", () => {
    expect(bench.workload).toBe("image");
    expect(lossOf(bench, bench.baseline)).toBe(0);
    expect(lossOf(bench, byId("dpcache-k20"))).toBe(0.0113);
  });

  it("reads token disagreement on the speech benchmark and formats latency in milliseconds", () => {
    const omni = findBenchmark("qwen3-omni", "rtx5090")!;
    const kernels = omni.recipes.find((r) => r.id === "kernels")!;
    expect(lossOf(omni, omni.baseline)).toBe(0);
    expect(lossOf(omni, kernels)).toBe(0.0188);
    expect(fmtLoss(omni, 0.0188)).toBe("1.88%");
    expect(fmtLatency(omni, 0.2221)).toBe("222 ms");
    expect(fmtLatency(bench, 13.578)).toBe("13.6s");
    expect(WORKLOADS.speech.quality.name).toBe("Disagreement");
    // shown, never the loss
    expect(kernels.metrics.asrWer).toEqual({ mean: 0.0319, max: 0.3801 });
  });
});

describe("paretoFrontier", () => {
  it("returns recipes sorted by latency with strictly decreasing loss", () => {
    const frontier = paretoFrontier(bench);
    expect(frontier.length).toBeGreaterThan(1);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.metrics.latencyS).toBeGreaterThanOrEqual(
        frontier[i - 1]!.metrics.latencyS,
      );
      expect(lossOf(bench, frontier[i]!)).toBeLessThan(lossOf(bench, frontier[i - 1]!));
    }
  });

  it("includes the baseline as the last point", () => {
    expect(paretoFrontier(bench).at(-1)?.id).toBe("sglang-native");
  });

  it("puts every speech recipe on the frontier, ending at the baseline", () => {
    const omni = findBenchmark("qwen3-omni", "rtx5090")!;
    // kernels is twice as fast as Marlin for 0.13 points more disagreement; both beat the baseline
    expect(paretoFrontier(omni).map((r) => [r.id, lossOf(omni, r)])).toEqual([
      ["kernels", 0.0188],
      ["deterministic-marlin", 0.0175],
      ["vllm-omni-native", 0],
    ]);
    expect(fastestUnder(omni, WORKLOADS.speech.quality.defaultLimit)?.id).toBe("kernels");
    expect(fastestUnder(omni, 0.018)?.id).toBe("deterministic-marlin");
    expect(
      speedup(
        omni,
        omni.recipes.find((r) => r.id === "kernels")!,
      ),
    ).toBeCloseTo(8.96, 2);
  });

  it("does not mutate its input", () => {
    const ids = recipes.map((x) => x.id);
    paretoFrontier(bench);
    expect(recipes.map((x) => x.id)).toEqual(ids);
  });
});

describe("fastestUnder", () => {
  it("picks the lowest-latency recipe within the loss limit", () => {
    expect(fastestUnder(bench, 0.03)?.id).toBe("dpcache-k20");
    // K=20 measured .0113 on the held-out set, so only the baseline meets .01
    expect(fastestUnder(bench, 0.01)?.id).toBe("sglang-native");
    expect(fastestUnder(bench, 1)?.id).toBe("fp8-sage2-kernels-dpcache");
  });

  it("falls back to the baseline at limit 0 and null when nothing qualifies", () => {
    expect(fastestUnder(bench, 0)?.id).toBe("sglang-native");
    expect(fastestUnder(bench, -1)).toBeNull();
    expect(fastestUnder({ ...bench, recipes: [] }, 1)).toBeNull();
  });
});

describe("workloads", () => {
  it("rejects a benchmark whose workload disagrees with its model's", () => {
    const { recipes: _r, baseline, updated: _u, ...file } = bench;
    const { name: _n, ...baselineFile } = baseline;
    const speechProtocol = {
      version: "v0.1",
      batch: 1,
      precision: "x",
      decoding: "x",
      output: "x",
    };
    const files = {
      "x/qwen-image-2.1/rtx5090/benchmark.json": {
        ...file,
        workload: "speech",
        protocol: speechProtocol,
      },
      "x/qwen-image-2.1/rtx5090/recipes/sglang-native.json": baselineFile,
    };
    expect(() => buildBenchmarks(files)).toThrow(
      /workload "speech" but qwen-image-2.1 is a image model/,
    );
  });
});

describe("recipe names", () => {
  it("rejects a name on the baseline, which is always Baseline", () => {
    const { recipes: _r, baseline, updated: _u, ...file } = bench;
    const { name: _n, ...baselineFile } = baseline;
    const files = {
      "x/qwen-image-2.1/rtx5090/benchmark.json": file,
      "x/qwen-image-2.1/rtx5090/recipes/sglang-native.json": { ...baselineFile, name: "Stock" },
    };
    expect(() => buildBenchmarks(files)).toThrow(/baseline is always named Baseline/);
  });
});

describe("speedup", () => {
  it("is baseline latency over recipe latency", () => {
    expect(speedup(bench, bench.baseline)).toBe(1);
    expect(speedup(bench, byId("dpcache-k20"))).toBeCloseTo(1.923, 2);
  });
});

describe("protocolRows", () => {
  it("lists each workload's own protocol fields", () => {
    expect(protocolRows(bench).map(([k]) => k)).toEqual([
      "Resolution",
      "Batch",
      "Steps",
      "Precision",
      "Guidance",
      "Attention",
      "Offload",
    ]);
    expect(protocolRows(bench)[0]).toEqual(["Resolution", "1024×1024"]);
    const omni = findBenchmark("qwen3-omni", "rtx5090")!;
    expect(protocolRows(omni)).toEqual([
      ["Output", "text + 24 kHz speech, streamed"],
      ["Batch", 1],
      ["Precision", "AWQ W4A16"],
      ["Decoding", "greedy, seed 42"],
    ]);
  });
});

describe("fmtPct", () => {
  it("shows a percentage with two decimals and zero or null as an em dash, like fmtLpips", () => {
    expect(fmtPct(0.0188)).toBe("1.88%");
    expect(fmtPct(0.0175)).toBe("1.75%");
    expect(fmtPct(0)).toBe("—");
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(undefined)).toBe("—");
    expect(WORKLOADS.speech.quality.tick(0.015)).toBe("1.5%");
    expect(WORKLOADS.speech.quality.tick(0.01)).toBe("1%");
  });
});

describe("fmtLpips", () => {
  it("renders null/undefined/0 as an em dash and strips the leading zero otherwise", () => {
    expect(fmtLpips(null)).toBe("—");
    expect(fmtLpips(undefined)).toBe("—");
    expect(fmtLpips(0)).toBe("—");
    expect(fmtLpips(0.028)).toBe(".028");
    expect(fmtLpips(0.1)).toBe(".100");
  });
});
