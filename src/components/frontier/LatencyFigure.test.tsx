import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { findBenchmark, WORKLOADS } from "@/data/frontier";
import { LatencyFigure } from "./LatencyFigure";

afterEach(cleanup);

const omni = findBenchmark("qwen3-omni", "rtx5090")!;
const step = WORKLOADS.speech.quality.limitStep;

const renderFigure = (limit = WORKLOADS.speech.quality.defaultLimit, selectedId = "kernels") => {
  const onLimitChange = vi.fn();
  const onSelect = vi.fn();
  render(
    <LatencyFigure
      bench={omni}
      limit={limit}
      selectedId={selectedId}
      onSelect={onSelect}
      onLimitChange={onLimitChange}
    />,
  );
  return { onLimitChange, onSelect };
};

const row = (id: string) => document.querySelector(`[data-recipe="${id}"]`)!;

describe("LatencyFigure", () => {
  it("lists one bar per recipe, fastest first, with its short name, latency and ΔWER", () => {
    renderFigure();
    const ids = [...document.querySelectorAll("[data-recipe]")].map((e) =>
      e.getAttribute("data-recipe"),
    );
    expect(ids).toEqual(["kernels", "deterministic-marlin", "vllm-omni-native"]);
    expect(row("kernels")).toHaveTextContent("Megakernels");
    expect(row("kernels")).toHaveTextContent("23 ms");
    expect(row("kernels")).toHaveTextContent("9.3×");
    expect(row("kernels")).toHaveTextContent("−0.58 pp");
    expect(row("deterministic-marlin")).toHaveTextContent("Deterministic Marlin");
  });

  it("scales each bar to its latency against the slowest recipe", () => {
    renderFigure();
    const width = (id: string) =>
      parseFloat((row(id).querySelector("[data-bar]") as HTMLElement).style.width);
    expect(width("vllm-omni-native")).toBe(100);
    expect(width("kernels")).toBeCloseTo((0.023 / 0.213) * 100, 5);
  });

  it("passes recipes at or under the gate and fails the ones above it", () => {
    renderFigure(0.005);
    expect(row("kernels")).toHaveAttribute("data-pass", "true");
    expect(row("vllm-omni-native")).toHaveAttribute("data-pass", "true");
    // Marlin is +1.05 pp, above a +0.50 pp gate
    expect(row("deterministic-marlin")).toHaveAttribute("data-pass", "false");
    expect(screen.getByTestId("quality-gate")).toHaveTextContent("ΔWER ≤ +0.50 pp");
  });

  it("marks the selected recipe and selects a recipe when its row is clicked", () => {
    const { onSelect } = renderFigure();
    expect(row("kernels")).toHaveAttribute("aria-pressed", "true");
    expect(row("vllm-omni-native")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row("vllm-omni-native"));
    expect(onSelect).toHaveBeenCalledWith("vllm-omni-native");
  });

  it("moves the gate one step per button press", () => {
    const { onLimitChange } = renderFigure(0.005);
    fireEvent.click(screen.getByRole("button", { name: /loosen/i }));
    expect(onLimitChange).toHaveBeenLastCalledWith(0.005 + step);
    fireEvent.click(screen.getByRole("button", { name: /tighten/i }));
    expect(onLimitChange).toHaveBeenLastCalledWith(0.005 - step);
  });

  it("stops the gate one step past the lowest and highest loss", () => {
    // losses run from −0.58 pp (kernels) to +1.05 pp (Marlin)
    const low = renderFigure(-0.0068);
    expect(screen.getByRole("button", { name: /tighten/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /loosen/i }));
    expect(low.onLimitChange).toHaveBeenLastCalledWith(-0.0058);
    cleanup();
    renderFigure(0.0115);
    expect(screen.getByRole("button", { name: /loosen/i })).toBeDisabled();
  });
});
