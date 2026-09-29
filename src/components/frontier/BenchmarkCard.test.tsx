import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { findBenchmark, fmtLimit, ladder, speedup, type Benchmark } from "@/data/frontier";
import { BenchmarkCard } from "./BenchmarkCard";

afterEach(cleanup);

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;

const rows = () =>
  screen.getAllByRole("row").map((r) =>
    within(r)
      .getAllByRole("cell")
      .map((c) => c.textContent?.trim()),
  );

describe("BenchmarkCard", () => {
  it("shows the model, hardware and baseline latency", () => {
    render(<BenchmarkCard bench={bench} />);
    expect(screen.getByText("Qwen-Image 2.1")).toBeInTheDocument();
    expect(screen.getByText("RTX 5090")).toBeInTheDocument();
    expect(screen.getByText("baseline 12.0s")).toBeInTheDocument();
  });

  it("renders one ladder row per default limit, matching ladder()", () => {
    render(<BenchmarkCard bench={bench} />);
    const expected = ladder(bench).map(({ limit, recipe }) => [
      `≤ ${fmtLimit(limit)} LPIPS`,
      `${recipe!.metrics.latencyS.toFixed(1)}s`,
      `${speedup(bench, recipe!).toFixed(1)}×`,
      recipe!.name,
    ]);
    expect(expected).toHaveLength(3);
    expect(rows()).toEqual(expected);
    // Not tautological: the demo data's ≤.05 winner is dpcache-fp8-sparge-compile (lpips .047).
    expect(rows()[1]).toEqual([
      "≤ .05 LPIPS",
      "1.7s",
      "7.1×",
      "DPCache + FP8 + SpargeAttn + torch.compile",
    ]);
    expect(rows()[0]).toEqual(["≤ .01 LPIPS", "6.1s", "2.0×", "DPCache"]);
    expect(rows()[2]).toEqual([
      "≤ .10 LPIPS",
      "1.2s",
      "10.0×",
      "20-step schedule + DPCache + FP8 + torch.compile",
    ]);
  });

  it("footers with recipe count, engine, update date and the demo-data tag", () => {
    render(<BenchmarkCard bench={bench} />);
    expect(screen.getByText(/10 recipes · sglang-diffusion · 2026-09-21/)).toBeInTheDocument();
    expect(screen.getByText("demo data")).toHaveClass("text-experimental");
  });

  it("renders em dashes when no recipe meets a limit", () => {
    // The baseline (lpips null → 0) meets every limit, so an empty recipe set is the only way
    // to leave every rung unmet.
    const empty: Benchmark = { ...bench, recipes: [] };
    render(<BenchmarkCard bench={empty} />);
    for (const cells of rows()) expect(cells.slice(1)).toEqual(["—", "—", "—"]);
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
    expect(screen.getByText(/0 recipes/)).toBeInTheDocument();
  });
});
