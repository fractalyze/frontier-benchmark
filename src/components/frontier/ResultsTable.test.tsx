import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { findBenchmark } from "@/data/frontier";
import { ResultsTable } from "./ResultsTable";

// No `globals: true` in the vitest config, so RTL's auto-cleanup and jsdom's missing
// scrollIntoView both need handling here.
afterEach(cleanup);
Element.prototype.scrollIntoView = vi.fn();

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;

const renderTable = (openId: string | null = null, onSelect = vi.fn()) => {
  render(
    <ResultsTable
      bench={bench}
      limit={0.05}
      selectedId={null}
      openId={openId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
};

/** Row containing the given recipe name. */
const rowOf = (name: string) => screen.getByText(name).closest("tr")!;
/** The <dd> paired with a <dt> label in the open detail row. */
const cellOf = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;

describe("ResultsTable", () => {
  it("renders the 7 column headers in order", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Latency",
      "Throughput",
      "LPIPS",
      "Speedup",
      "Recipe",
      "Engine",
      "Verified",
    ]);
  });

  it("formats the dpcache-fp8 row", () => {
    renderTable();
    const cells = within(rowOf("DPCache + FP8"))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "2.4s",
      "0.67 img/s",
      ".028",
      "5.0×",
      "DPCache + FP8",
      "sglang-diffusion 0.5.0",
      "experimental",
    ]);
  });

  it("shows full metrics and provenance in the open detail row", () => {
    renderTable("dpcache-fp8");
    expect(cellOf("PSNR")).toHaveTextContent("31.9 dB");
    expect(cellOf("SSIM")).toHaveTextContent("0.912");
    expect(cellOf("ImageReward")).toHaveTextContent("0.92");
    expect(cellOf("Peak VRAM")).toHaveTextContent("15.7 GB");
    expect(cellOf("Measured on")).toHaveTextContent("public set, 100 prompts, 2026-09-21");
  });

  it("renders em dashes for the baseline's null metrics and provenance", () => {
    renderTable("sglang-default");
    const cells = within(rowOf("Baseline")).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent(/^—$/);
    for (const label of [
      "LPIPS mean",
      "LPIPS p95",
      "PSNR",
      "SSIM",
      "Config",
      "Commit",
      "Submission",
    ])
      expect(cellOf(label)).toHaveTextContent(/^—$/);
    for (const label of ["Config", "Commit", "Submission"])
      expect(cellOf(label).querySelector("a")).toBeNull();
    expect(screen.getByText("none (reference)")).toBeInTheDocument();
  });

  it("calls onSelect with the recipe id on row click", () => {
    const onSelect = renderTable();
    fireEvent.click(rowOf("DPCache + FP8"));
    expect(onSelect).toHaveBeenCalledWith("dpcache-fp8");
  });
});
