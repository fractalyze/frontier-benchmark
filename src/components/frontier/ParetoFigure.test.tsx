import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { findBenchmark, WORKLOADS } from "@/data/frontier";
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
  it("puts the grip on the dashed line inside the chart, not in a slider below it", () => {
    renderFigure(0.05);
    const grip = screen.getByTestId("limit-grip");
    expect(grip.closest("svg")).not.toBeNull();
    expect(grip).toHaveAttribute("role", "slider");
    expect(grip).toHaveAttribute("aria-orientation", "vertical");
    // the grip's parent group carries the line's height; the grip only adds an x offset
    expect(grip.getAttribute("transform")).toMatch(/^translate\([\d.]+ 0\)$/);
    expect(document.querySelector(".cursor-ew-resize")).toBeNull();
  });

  it("slides the grip left and right along the line without touching the limit", () => {
    const { slider, onLimitChange } = renderFigure(0.05);
    const xOf = () => parseFloat(slider.getAttribute("transform")!.slice("translate(".length));
    const before = xOf();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(xOf()).toBeGreaterThan(before);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(xOf()).toBeLessThan(before);
    expect(onLimitChange).not.toHaveBeenCalled();
  });

  it("exposes the limit as a keyboard slider with its value in the tag", () => {
    const { slider } = renderFigure(0.05);
    expect(slider).toHaveAttribute("aria-valuenow", "0.05");
    expect(slider).toHaveAttribute("aria-valuetext", "LPIPS ≤ .050");
    expect(screen.getAllByText("LPIPS ≤ .050").length).toBeGreaterThanOrEqual(1);
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

  it("draws frontier points solid and dominated recipes as hollow grey rings", () => {
    renderFigure(0.05);
    const marker = (id: string) =>
      document.querySelector(`[data-recipe="${id}"] circle:nth-of-type(2)`)!;
    // on the frontier and within the limit: solid blue
    expect(marker("dpcache-k20")).toHaveClass("fill-frontier");
    // on the frontier but above the limit: solid grey
    expect(marker("fp8-sage2-kernels-dpcache")).toHaveClass("fill-dominated-strong");
    // dominated (Cache-DiT conservative is slower than DPCache K=20 for worse LPIPS): hollow ring
    expect(marker("cachedit-conservative")).toHaveClass(
      "fill-background",
      "stroke-dominated-strong",
    );
    expect(marker("cachedit-conservative")).not.toHaveClass("fill-dominated-strong");
    expect(marker("cachedit-conservative")).toHaveAttribute("r", "3.5");
    expect(marker("cachedit-conservative")).not.toHaveClass("opacity-50");
    // dominated and above the limit: same ring, faded
    expect(marker("cachedit-stock")).toHaveClass("stroke-dominated-strong", "opacity-50");
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

describe("ParetoFigure on the speech page", () => {
  const omni = findBenchmark("qwen3-omni", "rtx5090")!;
  const renderSpeech = (limit = WORKLOADS.speech.quality.defaultLimit) => {
    const onLimitChange = vi.fn();
    const { container } = render(
      <ParetoFigure
        bench={omni}
        limit={limit}
        selectedId={null}
        onSelect={vi.fn()}
        onLimitChange={onLimitChange}
      />,
    );
    return { onLimitChange, container, slider: screen.getByRole("slider") };
  };

  it("renders every recipe with token disagreement in percent, all on the frontier", () => {
    const { slider } = renderSpeech();
    expect(document.querySelectorAll("[data-recipe]")).toHaveLength(3);
    expect(slider).toHaveAttribute("aria-valuetext", "Disagreement ≤ 2.00%");
    expect(screen.getByText("Time to first audio (ms)")).toBeInTheDocument();
    expect(screen.getByText("Quality loss (token disagreement, %)")).toBeInTheDocument();
    for (const id of ["kernels", "deterministic-marlin", "vllm-omni-native"])
      expect(document.querySelector(`[data-recipe="${id}"]`)).toHaveAttribute(
        "data-frontier",
        "true",
      );
  });

  it("labels latency ticks in milliseconds, every 25 ms", () => {
    const { container } = renderSpeech();
    // the limit's tag is centred too; tick labels are the bare numbers
    const xLabels = [...container.querySelectorAll("text[text-anchor='middle'].num")]
      .map((t) => t.textContent)
      .filter((t) => /^\d+$/.test(t ?? ""));
    expect(xLabels).toEqual(["0", "25", "50", "75", "100", "125", "150", "175", "200", "225"]);
  });

  it("starts the loss axis at zero and ticks every half percent", () => {
    const { container } = renderSpeech();
    const yLabels = [...container.querySelectorAll("text[text-anchor='end'].num")].map(
      (t) => t.textContent,
    );
    expect(yLabels).toEqual(["0", "0.5%", "1%", "1.5%", "2%", "2.5%", "3%"]);
  });

  it("never lets the limit below 0.1%", () => {
    const { slider, onLimitChange } = renderSpeech(0.001);
    expect(Number(slider.getAttribute("aria-valuemin"))).toBe(0.001);
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onLimitChange).toHaveBeenLastCalledWith(0.001);
  });
});
