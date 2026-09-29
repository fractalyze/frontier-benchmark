import { describe, expect, it } from "vitest";

import { BENCHMARKS, fastestUnder, fmtLpips, paretoFrontier, speedup } from "@/data/frontier";

const bench = BENCHMARKS[0]!;
const { recipes } = bench;

describe("paretoFrontier", () => {
  it("returns recipes sorted by latency with strictly decreasing lpipsMean", () => {
    const frontier = paretoFrontier(recipes);
    expect(frontier.length).toBeGreaterThan(1);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.latencyS).toBeGreaterThanOrEqual(frontier[i - 1]!.latencyS);
      expect(frontier[i]!.lpipsMean).toBeLessThan(frontier[i - 1]!.lpipsMean);
    }
  });

  it("includes the baseline (lpipsMean 0) as the last point", () => {
    const frontier = paretoFrontier(recipes);
    expect(frontier.at(-1)?.id).toBe("sglang-default");
  });

  it("does not mutate its input", () => {
    const ids = recipes.map((x) => x.id);
    paretoFrontier(recipes);
    expect(recipes.map((x) => x.id)).toEqual(ids);
  });
});

describe("fastestUnder", () => {
  it("picks the lowest-latency recipe within the lpips limit", () => {
    expect(fastestUnder(recipes, 0.03)?.id).toBe("dpcache-fp8");
    expect(fastestUnder(recipes, 0.01)?.id).toBe("dpcache");
    expect(fastestUnder(recipes, 1)?.id).toBe("steps20-dpcache-fp8-compile");
  });

  it("returns null when no recipe satisfies the limit", () => {
    expect(fastestUnder(recipes, -1)).toBeNull();
    expect(fastestUnder([], 1)).toBeNull();
  });
});

describe("speedup", () => {
  it("is baseline latency over recipe latency", () => {
    const baseline = recipes.find((x) => x.id === "sglang-default")!;
    expect(speedup(bench, baseline)).toBe(1);
    const dpcacheFp8 = recipes.find((x) => x.id === "dpcache-fp8")!;
    expect(speedup(bench, dpcacheFp8)).toBeCloseTo(5);
  });
});

describe("fmtLpips", () => {
  it("renders 0 as an em dash and strips the leading zero otherwise", () => {
    expect(fmtLpips(0)).toBe("—");
    expect(fmtLpips(0.028)).toBe(".028");
    expect(fmtLpips(0.1)).toBe(".100");
  });
});
