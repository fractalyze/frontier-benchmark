import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import {
  findBenchmark,
  fmtLpips,
  lpipsOf,
  modelBySlug,
  paretoFrontier,
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
  screen
    .queryAllByRole("row")
    .filter((r) => within(r).queryAllByRole("cell").length > 0)
    .map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent?.trim()),
    );

describe("ModelCard", () => {
  it("links the title (stretched over the card), shows baseline latency and a hardware select", () => {
    const { container } = render(<ModelCard model={model} benches={[bench]} renderLink={link} />);
    const title = screen.getByText("Qwen-Image 2.1");
    expect(title.closest("a")).toHaveAttribute("href", "/qwen-image-2.1/rtx5090");
    expect(title).toHaveClass("after:absolute", "after:inset-0");
    expect(screen.getByText("baseline 13.6s")).toBeInTheDocument();
    expect(screen.getByText("View benchmark")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("cursor-pointer", "group");
    const select = screen.getByRole("combobox", { name: "Hardware" });
    expect(select).toHaveTextContent("RTX 5090");
    expect(select).toHaveClass("z-10");
  });

  it("lists the benchmark's Pareto frontier, quality first, exactly as the page's chart", () => {
    render(<ModelCard model={model} benches={[bench]} renderLink={link} />);
    const expected = paretoFrontier(bench.recipes)
      .filter((r) => r.id !== bench.baseline.id)
      .reverse()
      .map((r) => [
        fmtLpips(lpipsOf(r)),
        `${r.metrics.latencyS.toFixed(1)}s`,
        `${speedup(bench, r).toFixed(1)}×`,
        r.name,
      ]);
    expect(rows()).toEqual(expected);
    // Not tautological: literal values from the measured data.
    expect(rows()).toEqual([
      [".011", "7.1s", "1.9×", "DPCache K=20"],
      [".080", "4.5s", "3.0×", "DPCache K=12"],
      [
        ".129",
        "2.0s",
        "6.7×",
        "FP8 W8A8 per-channel + SageAttention2 + fused text-encoder and VAE kernels + DPCache K=12",
      ],
    ]);
    // dominated recipes (slower and no better) stay off the card
    expect(screen.queryByText("Cache-DiT conservative")).toBeNull();
  });

  it("shows every FLUX recipe on the frontier even though all exceed LPIPS .10", () => {
    const flux = findBenchmark("flux-2-klein-4b", "rtx5090")!;
    render(<ModelCard model={modelBySlug("flux-2-klein-4b")!} benches={[flux]} renderLink={link} />);
    expect(rows().map((r) => r.slice(0, 3))).toEqual([
      [".120", "3.1s", "5.8×"],
      [".193", "2.6s", "6.9×"],
    ]);
  });

  it("switches the frontier and links when another hardware is selected", () => {
    const other: Benchmark = {
      ...bench,
      hardware: "h100",
      recipes: [bench.baseline],
      baseline: bench.baseline,
    };
    render(<ModelCard model={model} benches={[bench, other]} renderLink={link} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Hardware" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "H100" }));
    expect(rows()).toEqual([]);
    expect(screen.getByText(/no recipe faster than the baseline yet/)).toBeInTheDocument();
    expect(screen.getByText("Qwen-Image 2.1").closest("a")).toHaveAttribute(
      "href",
      "/qwen-image-2.1/h100",
    );
  });

  it("renders a note instead of a table when nothing beats the baseline", () => {
    const empty: Benchmark = { ...bench, recipes: [bench.baseline] };
    render(<ModelCard model={model} benches={[empty]} renderLink={link} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/no recipe faster than the baseline yet/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });
});
