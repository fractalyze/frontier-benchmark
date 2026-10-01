import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  fastestUnder,
  findBenchmark,
  fmtLatency,
  fmtLoss,
  fmtLpips,
  lossOf,
  paretoFrontier,
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
    ]);
    expect(bench.model).toBe("qwen-image-2.1");
    expect(bench.hardware).toBe("rtx5090");
    expect(recipes).toHaveLength(10);
  });

  it("loads the flux-2-klein-4b / rtx5090 benchmark with its 4 recipes", () => {
    const flux = findBenchmark("flux-2-klein-4b", "rtx5090")!;
    expect(flux.baseline.id).toBe("sglang-native");
    expect(flux.recipes).toHaveLength(4);
    expect(flux.protocol.steps).toBe(50);
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
  });
});

describe("lossOf", () => {
  it("reads the workload's quality key and treats the baseline's null as zero loss", () => {
    expect(bench.workload).toBe("image");
    expect(lossOf(bench, bench.baseline)).toBe(0);
    expect(lossOf(bench, byId("dpcache-k20"))).toBe(0.0113);
  });

  it("reads wer on a speech benchmark and formats latency in milliseconds", () => {
    const speech = {
      ...bench,
      workload: "speech" as const,
      recipes: [
        { ...bench.baseline, metrics: { ...bench.baseline.metrics, latencyS: 0.42 } },
        {
          ...byId("dpcache-k20"),
          metrics: { ...byId("dpcache-k20").metrics, lpips: null, wer: { mean: 0.02, max: 0.05 } },
        },
      ],
    };
    expect(lossOf(speech, speech.recipes[1]!)).toBe(0.02);
    expect(fmtLoss(speech, 0.02)).toBe(".020");
    expect(fmtLatency(speech, 0.42)).toBe("420 ms");
    expect(fmtLatency(bench, 13.578)).toBe("13.6s");
    expect(WORKLOADS.speech.quality.name).toBe("ΔWER");
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
    const files = {
      "x/qwen-image-2.1/rtx5090/benchmark.json": { ...file, workload: "speech" },
      "x/qwen-image-2.1/rtx5090/recipes/sglang-native.json": baselineFile,
    };
    expect(() => buildBenchmarks(files)).toThrow(
      /workload "speech" but qwen-image-2.1 is a image model/,
    );
  });
});

describe("speedup", () => {
  it("is baseline latency over recipe latency", () => {
    expect(speedup(bench, bench.baseline)).toBe(1);
    expect(speedup(bench, byId("dpcache-k20"))).toBeCloseTo(1.923, 2);
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

