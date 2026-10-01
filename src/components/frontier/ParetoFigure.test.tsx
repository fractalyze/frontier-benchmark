import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { findBenchmark } from "@/data/frontier";
import { LIMIT_STEP, ParetoFigure, xDomain } from "./ParetoFigure";

afterEach(cleanup);

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;

const renderFigure = (limit = 0.05) => {
  const onLimitChange = vi.fn();
  const onSelect = vi.fn();
  render(
    <ParetoFigure
      bench={bench}
      limit={limit}
      selectedId={null}
      onSelect={onSelect}
      onLimitChange={onLimitChange}
    />,
  );
  return { onLimitChange, onSelect, slider: screen.getByRole("slider") };
};

describe("ParetoFigure quality limit", () => {
  it("exposes the limit as a keyboard slider with its value in the tag", () => {
    const { slider } = renderFigure(0.05);
    expect(slider).toHaveAttribute("aria-valuenow", "0.05");
    expect(slider).toHaveAttribute("aria-valuetext", "LPIPS ≤ .050");
    expect(screen.getByText("LPIPS ≤ .050")).toBeInTheDocument();
  });

  it("nudges the limit by one step with the arrow keys, four with shift", () => {
    const { slider, onLimitChange } = renderFigure(0.05);
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onLimitChange).toHaveBeenLastCalledWith(+(0.05 + LIMIT_STEP).toFixed(3));
    fireEvent.keyDown(slider, { key: "ArrowDown", shiftKey: true });
    expect(onLimitChange).toHaveBeenLastCalledWith(+(0.05 - 4 * LIMIT_STEP).toFixed(3));
  });

  it("never nudges below .001", () => {
    const { slider, onLimitChange } = renderFigure(0.002);
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onLimitChange).toHaveBeenLastCalledWith(0.001);
  });

  it("starts the latency axis below the fastest recipe, on a tick, never at zero for real data", () => {
    expect(xDomain([4.5, 7, 13.6])).toEqual([2, 13.6 + (13.6 - 2) * 0.08]);
    expect(xDomain([0.5, 1])[0]).toBe(0);
  });

  it("draws frontier points blue or grey and dominated recipes as small grey dots", () => {
    renderFigure(0.05);
    const marker = (id: string) =>
      document.querySelector(`[data-recipe="${id}"] circle:nth-of-type(2)`)!;
    // on the frontier and within the limit: solid blue
    expect(marker("dpcache-k20")).toHaveClass("fill-frontier");
    // on the frontier but above the limit: solid grey
    expect(marker("fp8-sage2-kernels-dpcache")).toHaveClass("fill-dominated-strong");
    // dominated (Cache-DiT conservative is slower than DPCache K=20 for worse LPIPS): grey dot
    expect(marker("cachedit-conservative")).toHaveClass("fill-dominated-strong");
    expect(marker("cachedit-conservative")).toHaveAttribute("r", "3.5");
    expect(marker("cachedit-conservative")).not.toHaveAttribute("stroke-dasharray");
    expect(marker("cachedit-conservative")).not.toHaveClass("opacity-50");
    // dominated and above the limit: same dot, faded
    expect(marker("cachedit-stock")).toHaveClass("fill-dominated-strong", "opacity-50");
    expect(document.querySelector('[data-recipe="cachedit-conservative"]')).toHaveAttribute(
      "data-frontier",
      "false",
    );
  });

  it("selects a recipe when its point is clicked", () => {
    const { onSelect } = renderFigure();
    fireEvent.click(screen.getByText("Baseline"));
    expect(onSelect).toHaveBeenCalledWith(bench.baselineRecipe);
  });
});
