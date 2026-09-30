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
  it("renders the 6 column headers in order", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Latency", "LPIPS", "Speedup", "Recipe", "Engine", "Verified"]);
  });

  it("formats the dpcache-k20 row", () => {
    renderTable();
    const cells = within(rowOf("DPCache K=20"))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "6.8s",
      ".008",
      "2.0×",
      "DPCache K=20",
      "sglang-diffusion 2754e6ecf",
      "submitted",
    ]);
  });

  it("shows full metrics and provenance in the open detail row", () => {
    renderTable("dpcache-k20");
    expect(cellOf("PSNR")).toHaveTextContent("41.5 dB (min 28.2)");
    // Not measured by the source study: rendered as a dash, never as 0 or NaN.
    for (const label of ["SSIM", "ImageReward", "Peak VRAM"])
      expect(cellOf(label)).toHaveTextContent(/^—$/);
    expect(cellOf("Config").querySelector("a")).toHaveAttribute(
      "href",
      expect.stringContaining("configs/dpcache-K20.json"),
    );
    expect(cellOf("Source").querySelector("a")).toHaveAttribute(
      "href",
      expect.stringContaining("qwen_image21_dpcache/README.md"),
    );
    expect(cellOf("Measured on")).toHaveTextContent(
      "comparator-v1 (20 prompt/seed pairs), 2026-09-23",
    );
  });

  it("renders em dashes for the baseline's null metrics and provenance", () => {
    renderTable("sglang-native");
    const cells = within(rowOf("Baseline")).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(/^—$/);
    for (const label of ["LPIPS mean", "LPIPS max", "PSNR", "SSIM", "Config", "Submission"])
      expect(cellOf(label)).toHaveTextContent(/^—$/);
    for (const label of ["Config", "Submission"])
      expect(cellOf(label).querySelector("a")).toBeNull();
    expect(screen.getByText("none (reference)")).toBeInTheDocument();
  });

  it("calls onSelect with the recipe id on row click", () => {
    const onSelect = renderTable();
    fireEvent.click(rowOf("DPCache K=20"));
    expect(onSelect).toHaveBeenCalledWith("dpcache-k20");
  });
});
