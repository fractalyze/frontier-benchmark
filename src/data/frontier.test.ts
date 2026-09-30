import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  fastestUnder,
  findBenchmark,
  fmtLimit,
  fmtLpips,
  ladder,
  lpipsOf,
  paretoFrontier,
  speedup,
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

describe("lpipsOf", () => {
  it("treats the baseline's null lpips as zero loss", () => {
    expect(lpipsOf(bench.baseline)).toBe(0);
    expect(lpipsOf(byId("dpcache-k20"))).toBe(0.0113);
  });
});

describe("paretoFrontier", () => {
  it("returns recipes sorted by latency with strictly decreasing lpips", () => {
    const frontier = paretoFrontier(recipes);
    expect(frontier.length).toBeGreaterThan(1);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.metrics.latencyS).toBeGreaterThanOrEqual(
        frontier[i - 1]!.metrics.latencyS,
      );
      expect(lpipsOf(frontier[i]!)).toBeLessThan(lpipsOf(frontier[i - 1]!));
    }
  });

  it("includes the baseline as the last point", () => {
    expect(paretoFrontier(recipes).at(-1)?.id).toBe("sglang-native");
  });

  it("does not mutate its input", () => {
    const ids = recipes.map((x) => x.id);
    paretoFrontier(recipes);
    expect(recipes.map((x) => x.id)).toEqual(ids);
  });
});

describe("fastestUnder", () => {
  it("picks the lowest-latency recipe within the lpips limit", () => {
    expect(fastestUnder(recipes, 0.03)?.id).toBe("dpcache-k20");
    // K=20 measured .0113 on the held-out set, so only the baseline meets .01
    expect(fastestUnder(recipes, 0.01)?.id).toBe("sglang-native");
    expect(fastestUnder(recipes, 1)?.id).toBe("fp8-sage2-kernels-dpcache");
  });

  it("falls back to the baseline at limit 0 and null when nothing qualifies", () => {
    expect(fastestUnder(recipes, 0)?.id).toBe("sglang-native");
    expect(fastestUnder(recipes, -1)).toBeNull();
    expect(fastestUnder([], 1)).toBeNull();
  });
});

describe("speedup", () => {
  it("is baseline latency over recipe latency", () => {
    expect(speedup(bench, bench.baseline)).toBe(1);
    expect(speedup(bench, byId("dpcache-k20"))).toBeCloseTo(1.923, 2);
  });
});

describe("ladder", () => {
  it("defaults to the 0.01 / 0.05 / 0.1 limits", () => {
    expect(ladder(bench).map((s) => [s.limit, s.recipe?.id])).toEqual([
      [0.01, "sglang-native"],
      [0.05, "dpcache-k20"],
      [0.1, "dpcache-k12"],
    ]);
  });

  it("reports null for a limit nobody meets", () => {
    expect(ladder(bench, [-1, 0.03])).toEqual([
      { limit: -1, recipe: null },
      { limit: 0.03, recipe: byId("dpcache-k20") },
    ]);
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

describe("fmtLimit", () => {
  it("renders quality limits with two decimals and no leading zero", () => {
    expect(fmtLimit(0.01)).toBe(".01");
    expect(fmtLimit(0.05)).toBe(".05");
    expect(fmtLimit(0.1)).toBe(".10");
  });
});
