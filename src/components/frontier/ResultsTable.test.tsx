import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { findBenchmark, lpipsOf, speedup } from "@/data/frontier";
import { ResultsTable } from "./ResultsTable";

// No `globals: true` in the vitest config, so RTL's auto-cleanup needs handling here.
afterEach(cleanup);

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;
const k20 = bench.recipes.find((r) => r.id === "dpcache-k20")!;

const renderTable = ({
  openId = null,
  limit = 1,
  onSelect = vi.fn<(id: string) => void>(),
  onClose = vi.fn<() => void>(),
}: {
  openId?: string | null;
  limit?: number;
  onSelect?: ReturnType<typeof vi.fn<(id: string) => void>>;
  onClose?: ReturnType<typeof vi.fn<() => void>>;
} = {}) => {
  render(
    <ResultsTable
      bench={bench}
      limit={limit}
      selectedId={null}
      openId={openId}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { onSelect, onClose };
};

/** Table row for a recipe name. The open dialog repeats the name in its title and
 * aria-hides the page behind it, so the lookup is scoped to the (hidden) table. */
const rowOf = (name: string) =>
  within(screen.getByRole("table", { hidden: true }))
    .getByText(name)
    .closest("tr")!;
/** The <dd> paired with a <dt> label in the open detail dialog. */
const cellOf = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;

describe("ResultsTable", () => {
  it("renders the 6 column headers in order", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Latency", "LPIPS", "Speedup", "Recipe", "Engine", "Verified"]);
  });

  it("formats the dpcache-k20 row from its data", () => {
    renderTable();
    const cells = within(rowOf("DPCache K=20"))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      `${k20.metrics.latencyS.toFixed(1)}s`,
      `.${Math.round(lpipsOf(k20) * 1000)
        .toString()
        .padStart(3, "0")}`,
      `${speedup(bench, k20).toFixed(1)}×`,
      "DPCache K=20",
      `${k20.engine.name} ${k20.engine.version}`,
      "✓",
    ]);
  });

  it("hides recipes above the quality limit and says how many", () => {
    const limit = 0.05;
    renderTable({ limit });
    const within_ = bench.recipes.filter((r) => lpipsOf(r) <= limit);
    expect(screen.getAllByRole("row")).toHaveLength(within_.length + 1); // + header
    const hidden = bench.recipes.length - within_.length;
    expect(hidden).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp(`^${hidden} recipes? above LPIPS .050 hidden`)),
    ).toBeInTheDocument();
    expect(screen.queryByText("DPCache K=12")).toBeNull();
  });

  it("shows full metrics, configuration and provenance in the detail dialog", () => {
    renderTable({ openId: "dpcache-k20" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("DPCache K=20");
    const m = k20.metrics;
    expect(cellOf("PSNR")).toHaveTextContent(
      `${m.psnr!.mean.toFixed(1)} dB (min ${m.psnr!.min.toFixed(1)})`,
    );
    expect(cellOf("SSIM")).toHaveTextContent(m.ssim!.mean.toFixed(3));
    expect(cellOf("ImageReward")).toHaveTextContent(m.imageReward!.mean.toFixed(2));
    expect(cellOf("Peak VRAM")).toHaveTextContent(`${m.peakVramGb!.toFixed(1)} GB`);
    expect(cellOf("Config").querySelector("a")).toHaveAttribute(
      "href",
      expect.stringContaining("configs/dpcache-K20.json"),
    );
    expect(cellOf("Status")).toHaveTextContent(/^Verified$/);
    expect(cellOf("Measured on")).toHaveTextContent(
      `heldout-v1 (20 prompt/seed pairs), ${k20.date}`,
    );
    for (const line of k20.configuration)
      expect(within(dialog).getByText(line)).toBeInTheDocument();
  });

  it("renders em dashes for the baseline's null metrics and provenance", () => {
    renderTable({ openId: "sglang-native" });
    const cells = within(rowOf("Baseline")).getAllByRole("cell", { hidden: true });
    expect(cells[1]).toHaveTextContent(/^—$/);
    for (const label of [
      "LPIPS mean",
      "LPIPS max",
      "PSNR",
      "SSIM",
      "Config",
      "Source",
      "Submission",
    ])
      expect(cellOf(label)).toHaveTextContent(/^—$/);
    for (const label of ["Config", "Submission"])
      expect(cellOf(label).querySelector("a")).toBeNull();
    expect(screen.getByText("none (reference)")).toBeInTheDocument();
  });

  it("renders no dialog when nothing is open", () => {
    renderTable();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onSelect with the recipe id on row click, and onClose when the dialog closes", () => {
    const { onSelect, onClose } = renderTable({ openId: "dpcache-k20" });
    fireEvent.click(rowOf("DPCache K=20"));
    expect(onSelect).toHaveBeenCalledWith("dpcache-k20");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
