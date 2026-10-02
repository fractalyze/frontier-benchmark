import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildBenchmarks } from "@/data/frontier";
import { BenchmarkFileSchema, RecipeFileSchema } from "@/data/schema";

type Json = Record<string, unknown>;

const ROOT = path.resolve(__dirname, "../../data/benchmarks");
const DEMO = "/benchmarks/qwen-image-2.1/rtx5090";

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// Only the two file shapes the loader owns; configs/ holds recipe configs, not data.
const isDataFile = (f: string) => /(^|\/)(benchmark\.json|recipes\/[^/]+\.json)$/.test(f);
const files: Record<string, Json> = Object.fromEntries(
  walk(ROOT)
    .filter(isDataFile)
    .map((f) => [
      "/" + path.relative(path.dirname(ROOT), f).split(path.sep).join("/"),
      JSON.parse(fs.readFileSync(f, "utf8")) as Json,
    ]),
);
const names = Object.keys(files);

const clone = () => structuredClone(files);
const recipeIn = (f: Record<string, Json>, id: string) => f[`${DEMO}/recipes/${id}.json`]!;
const metricsOf = (r: Json) => r["metrics"] as Json;

describe("every file under data/benchmarks validates", () => {
  it("finds the demo benchmark and its recipes", () => {
    expect(names).toContain(`${DEMO}/benchmark.json`);
    expect(names.filter((f) => f.startsWith(`${DEMO}/recipes/`))).toHaveLength(10);
  });

  it.each(names.filter((f) => f.endsWith("/benchmark.json")))("%s", (f) => {
    expect(BenchmarkFileSchema.safeParse(files[f])).toMatchObject({ success: true });
  });

  it.each(names.filter((f) => f.includes("/recipes/")))("%s", (f) => {
    expect(RecipeFileSchema.safeParse(files[f])).toMatchObject({ success: true });
  });

  it("passes the loader's cross-file rules", () => {
    const bench = buildBenchmarks(files).find((b) => b.model === "qwen-image-2.1");
    expect(bench?.baseline.id).toBe("sglang-native");
    expect(bench?.recipes).toHaveLength(10);
  });
});

describe("schema rejects", () => {
  const recipe = () => structuredClone(recipeIn(files, "dpcache-k20"));

  it("negative latency", () => {
    const r = recipe();
    metricsOf(r)["latencyS"] = -1;
    expect(RecipeFileSchema.safeParse(r).success).toBe(false);
  });

  it("unknown technique", () => {
    const r = recipe();
    r["optimization"] = [{ technique: "Distillation", method: "x" }];
    expect(RecipeFileSchema.safeParse(r).success).toBe(false);
  });

  it("bad date", () => {
    const r = recipe();
    for (const d of ["2026/09/21", "21-09-2026", "2026-13-01", "2026-02-30"]) {
      r["date"] = d;
      expect(RecipeFileSchema.safeParse(r).success, d).toBe(false);
    }
  });

  it("unknown fields", () => {
    const r = recipe();
    r["latency"] = 1;
    expect(RecipeFileSchema.safeParse(r).success).toBe(false);
  });
});

describe("speech", () => {
  const SPEECH = "/benchmarks/qwen3-omni/rtx5090";
  const benchFile = () => structuredClone(files[`${SPEECH}/benchmark.json`]!);
  const protocolOf = (b: Json) => b["protocol"] as Json;
  const kernels = () => structuredClone(files[`${SPEECH}/recipes/kernels.json`]!);

  it("takes its own protocol: decoding and output, no resolution, steps or guidance", () => {
    expect(BenchmarkFileSchema.safeParse(benchFile()).success).toBe(true);
    for (const [k, v] of [
      ["resolution", "1024x1024"],
      ["steps", 50],
      ["guidance", 4],
      ["attention", "torch_sdpa"],
      ["offload", "none"],
    ] as const) {
      const b = benchFile();
      protocolOf(b)[k] = v;
      expect(BenchmarkFileSchema.safeParse(b).success, k).toBe(false);
    }
    const b = benchFile();
    delete protocolOf(b)["decoding"];
    expect(BenchmarkFileSchema.safeParse(b).success).toBe(false);
  });

  it("keeps the image protocol for image pages: no decoding or output", () => {
    const b = structuredClone(files[`${DEMO}/benchmark.json`]!);
    protocolOf(b)["decoding"] = "greedy";
    expect(BenchmarkFileSchema.safeParse(b).success).toBe(false);
  });

  it("rejects a speech protocol on an image page", () => {
    const b = structuredClone(files[`${DEMO}/benchmark.json`]!);
    b["protocol"] = protocolOf(benchFile());
    expect(BenchmarkFileSchema.safeParse(b).success).toBe(false);
  });

  it("accepts a signed wer: a recipe can make fewer errors than the baseline", () => {
    const r = kernels();
    expect(metricsOf(r)["wer"]).toEqual({ mean: -0.0058, max: 0.003 });
    expect(RecipeFileSchema.safeParse(r).success).toBe(true);
    metricsOf(r)["wer"] = { mean: -0.01, max: -0.002 };
    expect(RecipeFileSchema.safeParse(r).success).toBe(true);
  });

  it("still rejects a negative lpips", () => {
    const r = structuredClone(recipeIn(files, "dpcache-k20"));
    metricsOf(r)["lpips"] = { mean: -0.01, max: 0.02 };
    expect(RecipeFileSchema.safeParse(r).success).toBe(false);
  });

  it("requires wer on a non-baseline speech recipe", () => {
    const f = clone();
    metricsOf(f[`${SPEECH}/recipes/kernels.json`]!)["wer"] = null;
    expect(() => buildBenchmarks(f)).toThrow(/kernels\.json: non-baseline recipe is missing wer/);
  });
});

describe("loader rejects", () => {
  it("non-baseline with null lpips", () => {
    const f = clone();
    metricsOf(recipeIn(f, "dpcache-k20"))["lpips"] = null;
    expect(() => buildBenchmarks(f)).toThrow(/dpcache-k20\.json: non-baseline/);
  });

  it("baseline with non-empty optimization", () => {
    const f = clone();
    recipeIn(f, "sglang-native")["optimization"] = [{ technique: "Compilation", method: "x" }];
    expect(() => buildBenchmarks(f)).toThrow(/sglang-native\.json: baseline/);
  });

  it("duplicate ids", () => {
    const f = clone();
    f[`${DEMO}/recipes/fp9.json`] = structuredClone(recipeIn(f, "dpcache-k12"));
    expect(() => buildBenchmarks(f)).toThrow(/fp9\.json: duplicate recipe id "dpcache-k12"/);
  });

  it("id/filename mismatch", () => {
    const f = clone();
    recipeIn(f, "dpcache-k12")["id"] = "fp16";
    expect(() => buildBenchmarks(f)).toThrow(
      /dpcache-k12\.json: id "fp16" does not match filename/,
    );
  });

  it("unknown model slug", () => {
    const f = clone();
    f[`${DEMO}/benchmark.json`]!["model"] = "not-a-model";
    expect(() => buildBenchmarks(f)).toThrow(/benchmark\.json: unknown model "not-a-model"/);
  });

  it("missing baseline recipe", () => {
    const f = clone();
    f[`${DEMO}/benchmark.json`]!["baselineRecipe"] = "nope";
    expect(() => buildBenchmarks(f)).toThrow(/baselineRecipe "nope"/);
  });

  it("unknown hardware slug", () => {
    const f = clone();
    f[`${DEMO}/benchmark.json`]!["hardware"] = "rtx9999";
    expect(() => buildBenchmarks(f)).toThrow(/benchmark\.json: unknown hardware "rtx9999"/);
  });

  it("directory that does not match model/hardware", () => {
    const f = clone();
    f[`${DEMO}/benchmark.json`]!["hardware"] = "b200";
    expect(() => buildBenchmarks(f)).toThrow(/directory does not match model\/hardware/);
  });

  it("two directories declaring the same model/hardware", () => {
    const f = clone();
    for (const [k, v] of Object.entries(clone()))
      f[k.replace(DEMO, "/other/qwen-image-2.1/rtx5090")] = v;
    expect(() => buildBenchmarks(f)).toThrow(/duplicate benchmark for "qwen-image-2.1\/rtx5090"/);
  });

  it("directory without benchmark.json", () => {
    const f = clone();
    delete f[`${DEMO}/benchmark.json`];
    expect(() => buildBenchmarks(f)).toThrow(/benchmark\.json: missing/);
  });

  it("names every missing non-baseline field", () => {
    const f = clone();
    const r = recipeIn(f, "dpcache-k12");
    r["optimization"] = [];
    metricsOf(r)["lpips"] = null;
    expect(() => buildBenchmarks(f)).toThrow(
      /dpcache-k12\.json: non-baseline recipe is missing optimization, lpips/,
    );
  });

  it("accepts a non-baseline recipe with unmeasured psnr/ssim/imageReward/vram", () => {
    const f = clone();
    const r = recipeIn(f, "dpcache-k12");
    metricsOf(r)["psnr"] = null;
    metricsOf(r)["ssim"] = null;
    metricsOf(r)["imageReward"] = null;
    metricsOf(r)["peakVramGb"] = null;
    expect(
      buildBenchmarks(f)
        .find((b) => b.model === "qwen-image-2.1")
        ?.recipes.find((x) => x.id === "dpcache-k12"),
    ).toBeDefined();
  });

  it("links every configPath to a file that exists", () => {
    for (const f of names.filter((n) => n.includes("/recipes/"))) {
      const p = files[f]!["configPath"];
      if (typeof p === "string")
        expect(fs.existsSync(path.resolve(ROOT, "../..", p)), `${f} -> ${p}`).toBe(true);
    }
  });
});

describe("schema rejects paths that fileUrl() cannot link", () => {
  const recipe = () => structuredClone(recipeIn(files, "dpcache-k20"));
  it.each(["/abs/config.yaml", "../escape.yaml", "a/../b.yaml", "has space.yaml", "configs/"])(
    "%s",
    (p) => {
      const r = recipe();
      r["configPath"] = p;
      expect(RecipeFileSchema.safeParse(r).success).toBe(false);
    },
  );
  it("accepts a repo-relative config path", () => {
    const r = recipe();
    r["configPath"] = "data/benchmarks/qwen-image-2.1/rtx5090/configs/dpcache-K20.json";
    expect(RecipeFileSchema.safeParse(r).success).toBe(true);
  });
});
