import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import {
  findBenchmark,
  fmtLimit,
  ladder,
  modelBySlug,
  speedup,
  type Benchmark,
} from "@/data/frontier";
import { ModelCard } from "./ModelCard";

afterEach(cleanup);

const bench = findBenchmark("qwen-image-2.1", "rtx5090")!;
const model = modelBySlug("qwen-image-2.1")!;
const link = (b: Benchmark, children: React.ReactNode) => (
  <a href={`/${b.model}/${b.hardware}`}>{children}</a>
);

const rows = () =>
  screen.getAllByRole("row").map((r) =>
    within(r)
      .getAllByRole("cell")
      .map((c) => c.textContent?.trim()),
  );

describe("ModelCard", () => {
  it("links the title (stretched over the card), shows baseline latency and a hardware select", () => {
    render(<ModelCard model={model} benches={[bench]} renderLink={link} />);
    const title = screen.getByText("Qwen-Image 2.1");
    expect(title.closest("a")).toHaveAttribute("href", "/qwen-image-2.1/rtx5090");
    expect(title).toHaveClass("after:absolute", "after:inset-0");
    expect(screen.getByText("baseline 12.0s")).toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "Hardware" });
    expect(select).toHaveTextContent("RTX 5090");
    expect(select).toHaveClass("z-10");
  });

  it("renders latency, speedup and recipe for each default limit", () => {
    render(<ModelCard model={model} benches={[bench]} renderLink={link} />);
    const expected = ladder(bench).map(({ limit, recipe }) => [
      `≤ ${fmtLimit(limit)}`,
      `${recipe!.metrics.latencyS.toFixed(1)}s`,
      `${speedup(bench, recipe!).toFixed(1)}×`,
      recipe!.name,
    ]);
    expect(rows()).toEqual(expected);
    // Not tautological: literal values from the demo data.
    expect(rows()[0]).toEqual(["≤ .01", "6.1s", "2.0×", "DPCache"]);
    expect(rows()[1]).toEqual([
      "≤ .05",
      "1.7s",
      "7.1×",
      "DPCache + FP8 + SpargeAttn + torch.compile",
    ]);
    expect(rows()[2]).toEqual([
      "≤ .10",
      "1.2s",
      "10.0×",
      "20-step schedule + DPCache + FP8 + torch.compile",
    ]);
  });

  it("switches the ladder and links when another hardware is selected", () => {
    const other: Benchmark = {
      ...bench,
      hardware: "h100",
      recipes: [bench.baseline],
      baseline: bench.baseline,
    };
    render(<ModelCard model={model} benches={[bench, other]} renderLink={link} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Hardware" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "H100" }));
    expect(rows()[0]).toEqual(["≤ .01", "12.0s", "1.0×", "Baseline"]);
    expect(screen.getByText("Qwen-Image 2.1").closest("a")).toHaveAttribute(
      "href",
      "/qwen-image-2.1/h100",
    );
  });

  it("renders em dashes when no recipe meets a limit", () => {
    const empty: Benchmark = { ...bench, recipes: [] };
    render(<ModelCard model={model} benches={[empty]} renderLink={link} />);
    for (const cells of rows()) expect(cells.slice(1)).toEqual(["—", "—", "—"]);
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });
});
