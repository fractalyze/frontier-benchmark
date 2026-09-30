import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { findBenchmark } from "@/data/frontier";
import { LIMIT_STEP, ParetoFigure } from "./ParetoFigure";

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

  it("never nudges below the smallest step", () => {
    const { slider, onLimitChange } = renderFigure(LIMIT_STEP);
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onLimitChange).toHaveBeenLastCalledWith(LIMIT_STEP);
  });

  it("selects a recipe when its point is clicked", () => {
    const { onSelect } = renderFigure();
    fireEvent.click(screen.getByText("Baseline"));
    expect(onSelect).toHaveBeenCalledWith(bench.baselineRecipe);
  });
});
