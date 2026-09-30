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
    expect(select).toHaveValue("rtx5090");
    expect(select).toHaveClass("z-10");
  });

  it("renders speedup and recipe for each default limit", () => {
    render(<ModelCard model={model} benches={[bench]} renderLink={link} />);
    const expected = ladder(bench).map(({ limit, recipe }) => [
      `≤ ${fmtLimit(limit)}`,
      `${speedup(bench, recipe!).toFixed(1)}×`,
      recipe!.name,
    ]);
    expect(rows()).toEqual(expected);
    // Not tautological: literal values from the demo data.
    expect(rows()[0]).toEqual(["≤ .01", "2.0×", "DPCache"]);
    expect(rows()[1]).toEqual(["≤ .05", "7.1×", "DPCache + FP8 + SpargeAttn + torch.compile"]);
    expect(rows()[2]).toEqual([
      "≤ .10",
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
    // HardwareSelect lists hardware from BENCHMARKS, so the option must be forced in for the test.
    const select = screen.getByRole("combobox", { name: "Hardware" });
    select.append(new Option("H100", "h100"));
    fireEvent.change(select, { target: { value: "h100" } });
    expect(rows()[0]).toEqual(["≤ .01", "1.0×", "Baseline"]);
    expect(screen.getByText("Qwen-Image 2.1").closest("a")).toHaveAttribute(
      "href",
      "/qwen-image-2.1/h100",
    );
  });

  it("renders em dashes when no recipe meets a limit", () => {
    const empty: Benchmark = { ...bench, recipes: [] };
    render(<ModelCard model={model} benches={[empty]} renderLink={link} />);
    for (const cells of rows()) expect(cells.slice(1)).toEqual(["—", "—"]);
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });
});
