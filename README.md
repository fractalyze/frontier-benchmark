# Inference Frontier

An open archive of latency–quality Pareto frontiers for generative image and
video inference. Each benchmark is one model on one GPU; each row is a
**recipe** — a combination of optimizations (feature caching, quantization,
sparse attention, compilation, …) — measured against the un-optimized baseline
under one fixed protocol.

> **Status:** the site and data format are done; this repo's own measurement
> harness is not. The numbers in `data/` are real: they are transcribed from the
> DPCache study behind [sgl-project/sglang#40848](https://github.com/sgl-project/sglang/pull/40848)
> (one RTX 5090, frozen prompt corpus, `Submitted` status), with the source
> report linked from every recipe. Re-measuring them with a harness in this repo
> on a private held-out set is what turns them `Verified`.

## What is measured

All recipes on a page are compared to the same **baseline**: the engine's
native run under the page's protocol (for Qwen-Image 2.1 × RTX 5090: BF16,
40 steps, guidance 1, `torch_sdpa`, DiT layerwise offload, eager). Model
weights are never changed; distilled or fine-tuned checkpoints are not recipes.

| Metric        | Definition                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `latencyS`    | One image, prompt in → image out, one request at a time; how it was timed is written in `benchmark.json` `timing`                                                         |
| `peakVramGb`  | Peak GPU memory during the run (`null` when the source did not record it)                                                                                                 |
| `lpips`       | LPIPS(alex) vs. the baseline image for the same prompt and seed, mean and max over the prompt set. **Primary quality axis** — every chart and quality limit uses the mean |
| `psnr`        | PSNR (dB) vs. the baseline image, mean and min                                                                                                                            |
| `ssim`        | SSIM vs. the baseline image, mean (`null` until measured)                                                                                                                 |
| `imageReward` | ImageReward of the recipe's own images, mean (`null` until measured)                                                                                                      |

The baseline is compared against itself, so its `lpips` / `psnr` / `ssim`
are `null` and render as "—".

Two prompt sets exist per benchmark. The **public** set is checked into the
repo at the path `benchmark.json` declares (`data/prompts/`, prompt + seed
pairs), and results measured on it are `Submitted`. A private **held-out** set
(`null` until one exists) is run only by the maintainers; results re-measured
on it are `Verified`. This is what keeps a recipe from being tuned to the
prompts it is scored on.

## Data layout

```
data/benchmarks/<model>/<hardware>/
├── benchmark.json          # protocol shared by every recipe on the page
├── recipes/<id>.json       # one file per recipe; id == filename
└── configs/*               # the reproducible config each recipe points at
data/prompts/<set>.json     # the public prompt/seed pairs a page was scored on
```

`benchmark.json` holds the protocol (resolution, batch, steps, precision,
guidance, attention backend, offload, version), both prompt sets, how latency
was timed, and the id of the baseline recipe. A recipe file holds the engine
(name, version, link), the optimization list as `{ technique, method }` pairs,
short configuration notes, the metrics above, the status, which prompt set it
was measured on, the date, and provenance (`configPath`, `sourceUrl`, `pr`).

Techniques are a closed list: Step Reduction, Feature Caching, Sparse
Attention, Token Pruning, Quantization, Kernel Optimization, Compilation,
Parallelism. A recipe's display name is derived from its methods
(`DPCache + FP8`), so a name can never disagree with what it contains.

Every file is validated with the zod schema in `src/data/schema.ts`, and the
loader in `src/data/frontier.ts` enforces the cross-file rules: the declared
baseline recipe exists, has an empty optimization list and null vs.-baseline
metrics, and is the only recipe allowed to; ids are unique and match
filenames; the directory path matches the declared model/hardware; each
model × hardware pair appears once; model and hardware slugs are in the
catalogue. A bad data file fails `npm test` and `npm run build` with a message
naming the file.

## Adding a recipe

1. Copy an existing `recipes/<id>.json`, pick a new slug for the id and
   filename, and describe the optimization.
2. Point `configPath` at a reproducible config committed in the same PR.
3. Open a pull request. Maintainers run the recipe on the reference machine —
   first on the public set, then on the held-out set — and commit the
   metrics. Until then the file may carry `status: "Submitted"` with numbers
   from your own run on the same GPU.

The harness that produces the metrics (`bench/`, Python) is the next piece of
work and is not in the repo yet.

## Running locally

Node 22 (`.nvmrc`) and npm.

```sh
npm install
npm run dev      # http://localhost:8080 (falls back to the next free port)
npm test         # vitest: schema, loader, and component render tests
npm run lint     # eslint (prettier runs as an eslint rule); npm run format rewrites
npm run build    # production build (TanStack Start + nitro)
```

## Built with

TanStack Start, React 19, Tailwind CSS 4, zod, vitest.
