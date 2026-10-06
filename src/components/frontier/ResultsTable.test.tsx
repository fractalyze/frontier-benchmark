import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { findBenchmark, lossOf, speedup } from "@/data/frontier";
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
const cellOf = (label: string) =>
  within(screen.getByRole("dialog")).getByText(label).nextElementSibling as HTMLElement;

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
      `.${Math.round(lossOf(bench, k20) * 1000)
        .toString()
        .padStart(3, "0")}`,
      `${speedup(bench, k20).toFixed(1)}×`,
      "DPCache K=20",
      `${k20.engine.name} ${k20.engine.version}`,
      "✓",
    ]);
  });

  it("shows every recipe and marks the ones above the quality limit", () => {
    const limit = 0.05;
    renderTable({ limit });
    const rows = screen.getAllByRole("row").slice(1); // skip the header
    expect(rows).toHaveLength(bench.recipes.length);
    const within = rows.filter((r) => r.getAttribute("data-within-limit") === "true");
    expect(within).toHaveLength(bench.recipes.filter((r) => lossOf(bench, r) <= limit).length);
    expect(rowOf("DPCache K=12")).toHaveAttribute("data-within-limit", "false");
    expect(rowOf("DPCache K=20")).toHaveAttribute("data-within-limit", "true");
  });

  it("shows full metrics, configuration and provenance in the detail dialog", () => {
    renderTable({ openId: "dpcache-k20" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent("DPCache K=20");
    const m = k20.metrics;
    expect(cellOf("Latency")).toHaveTextContent(`${m.latencyS.toFixed(1)}s`);
    expect(cellOf("LPIPS mean")).toHaveTextContent(
      `.${Math.round(m.lpips!.mean * 1000)
        .toString()
        .padStart(3, "0")}`,
    );
    expect(cellOf("PSNR")).toHaveTextContent(`${m.psnr!.mean.toFixed(1)} dB`);
    expect(within(dialog).getByText(`min ${m.psnr!.min.toFixed(1)} dB`)).toBeInTheDocument();
    expect(cellOf("SSIM")).toHaveTextContent(m.ssim!.mean.toFixed(3));
    expect(cellOf("ImageReward")).toHaveTextContent(m.imageReward!.mean.toFixed(2));
    expect(cellOf("Peak VRAM")).toHaveTextContent(`${m.peakVramGb!.toFixed(1)} GB`);
    expect(cellOf("Config").querySelector("a")).toHaveAttribute(
      "href",
      expect.stringContaining("configs/dpcache-K20.json"),
    );
    expect(within(dialog).getByText("Verified")).toBeInTheDocument();
    expect(
      within(dialog).getByText(`measured on heldout-v1 (20 prompt/seed pairs), ${k20.date}`),
    ).toBeInTheDocument();
    for (const line of k20.configuration)
      expect(within(dialog).getByText(line)).toBeInTheDocument();
  });

  it("renders em dashes for the baseline's null metrics and omits absent provenance", () => {
    renderTable({ openId: "sglang-native" });
    const cells = within(rowOf("Baseline")).getAllByRole("cell", { hidden: true });
    expect(cells[1]).toHaveTextContent(/^—$/);
    for (const label of ["LPIPS mean", "PSNR", "SSIM"])
      expect(cellOf(label)).toHaveTextContent(/^—$/);
    const dialog = screen.getByRole("dialog");
    expect(cellOf("Engine")).toHaveTextContent("sglang-diffusion");
    for (const label of ["Config", "Source", "Submission"])
      expect(within(dialog).queryByText(label)).toBeNull();
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("opens the detail dialog without landing focus on its close button", () => {
    renderTable({ openId: "dpcache-k20" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Close" })).not.toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
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

describe("ResultsTable on the speech page", () => {
  const omni = findBenchmark("qwen3-omni", "rtx5090")!;
  const renderOmni = (openId: string | null = null) =>
    render(
      <ResultsTable
        bench={omni}
        limit={0.005}
        selectedId={null}
        openId={openId}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it("shows token disagreement in percent, a dash for the baseline, and milliseconds", () => {
    renderOmni();
    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) =>
        within(r)
          .getAllByRole("cell")
          .slice(0, 3)
          .map((c) => c.textContent),
      );
    expect(rows).toEqual([
      ["25 ms", "1.88%", "9.0×"],
      ["47 ms", "1.75%", "4.7×"],
      ["222 ms", "—", "1.0×"],
    ]);
  });

  it("shows ASR WER in place of the image-only tiles in the detail dialog", () => {
    renderOmni("kernels");
    const dialog = screen.getByRole("dialog");
    expect(cellOf("Disagreement mean")).toHaveTextContent("1.88%");
    expect(within(dialog).getByText("max 5.36% over the set")).toBeInTheDocument();
    expect(cellOf("ASR WER")).toHaveTextContent("3.19%");
    expect(within(dialog).getByText("baseline 2.02%; shown, not ranked")).toBeInTheDocument();
    for (const label of ["ImageReward", "PSNR", "SSIM", "Peak VRAM"])
      expect(within(dialog).queryByText(label)).toBeNull();
    expect(within(dialog).getByText("Verified")).toBeInTheDocument();
  });
});
