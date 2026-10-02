# Data model

Scope: every field in `data/`, what the loader enforces, and the values the UI
derives. Status: current · updated 2026-10-02.

Everything the site shows comes from JSON files under `data/`. The schema is
`src/data/schema.ts` (zod); the loader `src/data/frontier.ts` adds the
cross-file rules. A bad file fails `npm test` and `npm run build` with the
file named.

```
data/benchmarks/<model>/<hardware>/
├── benchmark.json          # workload + protocol shared by every recipe on the page
├── recipes/<id>.json       # one file per recipe; id == filename
└── configs/**              # reproducible configs recipes point at (loader ignores them)
data/prompts/<set>.json     # the public prompt/seed pairs a page can be scored on
```

## benchmark.json

| field            | meaning                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `model`          | slug from `MODELS` in `src/data/frontier.ts`; must equal the directory name          |
| `hardware`       | slug from `HARDWARE`; must equal the directory name                                  |
| `workload`       | `image` / `video` / `speech`; must equal the model's workload in `MODELS`            |
| `protocol`       | per workload, see below                                                              |
| `promptSets`     | `public: {name, count, path}` (file in repo) and `held-out: {name, count}` or `null` |
| `timing`         | one sentence: how latency was taken (the harness writes it)                          |
| `baselineRecipe` | id of the recipe every other recipe is compared to                                   |

### protocol

The file is a union on `workload`; each workload has its own strict protocol
and a field from another workload's protocol is rejected.

| workload     | fields                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| image, video | `version`, `resolution` (`WxH`), `batch`, `steps`, `precision`, `guidance`, `attention`, `offload` |
| speech       | `version`, `batch`, `precision`, `decoding` (sampling and seed), `output` (what a request returns) |

`protocolRows` in `src/data/frontier.ts` turns each into the header of the
benchmark page.

### Workloads

`WORKLOADS` in `src/data/frontier.ts` maps a workload to everything the UI needs:
section label and caption on the main page, the quality metric (which key under
`recipe.metrics`, its display name, formatter and methodology line) and the
latency label and format, and the chart's scales (tick spacing, the smallest
top of the loss axis, the default limit and its arrow-key step). Components
never hard-code a metric name or a scale.

| workload | quality key | quality name | latency                     |
| -------- | ----------- | ------------ | --------------------------- |
| image    | `lpips`     | LPIPS        | seconds per image           |
| video    | `lpips`     | LPIPS        | seconds per clip            |
| speech   | `wer`       | ΔWER         | milliseconds to first audio |

Latency is always stored in seconds (`latencyS`); the workload decides how it is
displayed. The video row is provisional: no page uses it yet.

**ΔWER** (speech) is signed. Each timed reply's audio is transcribed by
Qwen3-ASR-1.7B and scored against that reply's own text (openai-whisper's
`EnglishTextNormalizer`). `mean` is the recipe's word-weighted WER over all
timed replies minus the baseline's; `max` is the largest per-prompt increase.
Both are fractions (`-0.0058` is −0.58 pp) and are shown in signed percentage
points. Negative means fewer errors than the baseline, so the chart's loss
axis extends below zero and the limit can be negative.

## recipes/<id>.json

| field           | meaning                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `id`            | slug; equals the filename                                                                       |
| `engine`        | `{name, version, url}` — the inference engine and the exact commit                              |
| `optimization`  | list of `{technique, method}`; techniques are the closed list below; `[]` only for the baseline |
| `configuration` | short notes a reader needs to reproduce the run (shown in the recipe dialog)                    |
| `configPath`    | repo-relative path of the config the harness runs; `null` for the baseline                      |
| `metrics`       | see below                                                                                       |
| `status`        | `Verified` / `Submitted` / `Experimental` (see Status)                                          |
| `measuredOn`    | `public` or `held-out`; indexes `benchmark.json.promptSets`                                     |
| `date`          | `YYYY-MM-DD` of the measurement                                                                 |
| `sourceUrl`     | where the numbers were first reported (a report, a model card) or `null`                        |
| `pr`            | submission pull request number or `null`                                                        |

A recipe's display name is derived from its methods joined with `+` (`DPCache
K=20`, `FP8 W8A8 + SageAttention2`); the baseline is shown as "Baseline".

Techniques: Step Reduction, Feature Caching, Sparse Attention, Token Pruning,
Quantization, Kernel Optimization, Compilation, Parallelism, Stage Scheduling
(when the stages of a multi-stage pipeline run and hand data on; a closed list;
adding one is described in
[adding-a-recipe.md](adding-a-recipe.md#extension-points)).

### metrics

| key           | meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `latencyS`    | seconds per request, single request at a time, median after warmup, model loaded once                       |
| `peakVramGb`  | engine-reported peak allocated memory over the timed requests, or `null`                                    |
| `lpips`       | `{mean, max}` LPIPS(alex) vs the baseline output for the same prompt and seed; the image/video quality axis |
| `wer`         | `{mean, max}` ΔWER, signed (see Workloads); the speech quality axis (optional key)                          |
| `psnr`        | `{mean, min}` dB vs the baseline image, or `null`                                                           |
| `ssim`        | `{mean}` vs the baseline image, or `null`                                                                   |
| `imageReward` | `{mean}` ImageReward-v1.0 of the recipe's own images, absolute, or `null`                                   |

The baseline is compared to itself, so its quality keys are `null` and render
as "—"; it still has `latencyS`, `peakVramGb` and `imageReward`.

## Status and prompt sets

- **Experimental**: placeholder or unverified numbers. The loader still
  requires the quality key, so a recipe cannot be published without one.
- **Submitted**: measured by the submitter on the public prompt set.
- **Verified**: re-measured by the maintainers with `bench/` on the private
  held-out set (never committed). This is what keeps a recipe from being tuned
  to the prompts it is scored on.

## Cross-file rules the loader enforces

- the directory is `<model>/<hardware>` and matches the file's slugs; each
  pair appears once; slugs exist in the catalogues;
- the benchmark's workload matches the model's;
- `baselineRecipe` has a file, an empty `optimization` and `null` quality
  metrics; every other recipe has at least one optimization and the workload's
  quality key;
- recipe ids are unique and equal their filenames.

## Derived values

- `paretoFrontier(bench)`: recipes sorted by latency whose loss strictly
  improves on every faster recipe. With a nonnegative loss it ends at the
  baseline; with ΔWER a recipe can beat the baseline on both axes, and then
  the baseline is off the frontier (Qwen3-Omni: only `kernels` is on it). The
  chart's line and the main-page cards show exactly this set.
- `fastestUnder(bench, ε)`: the lowest-latency recipe with loss ≤ ε; what the
  quality-limit grip on the benchmark page selects.
- `speedup` = baseline latency / recipe latency.
