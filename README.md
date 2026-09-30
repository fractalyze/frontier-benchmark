# Inference Frontier

An open archive of latency–quality Pareto frontiers for generative image and
video inference. Each benchmark is one model on one GPU; each row is a
**recipe** — a combination of optimizations (feature caching, quantization,
sparse attention, compilation, …) — measured against the un-optimized baseline
under one fixed protocol.

> **Status:** the site and data format are done; the measurement harness is
> not. Every number currently in `data/` is a placeholder (all recipes carry
> `status: "Experimental"`), and the site says so wherever those numbers appear.

## What is measured

All recipes on a page are compared to the same **baseline**: the engine's
default run — BF16, 50 steps, no cache, no quantization. Model weights are
never changed; distilled or fine-tuned checkpoints are not recipes.

| Metric         | Definition                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `latencyS`     | One image, prompt in → image out, one request at a time, median over the prompt set after 3 warmup runs                                    |
| `peakVramGb`   | Peak GPU memory during the run                                                                                                             |
| `lpips`        | LPIPS vs. the baseline image for the same prompt and seed (mean and p95). **Primary quality axis** — every chart and quality limit uses it |
| `psnr`, `ssim` | PSNR (dB) and SSIM vs. the baseline image, mean                                                                                            |
| `imageReward`  | ImageReward score of the recipe's own images, mean (absolute, not vs. baseline)                                                            |

The baseline is compared against itself, so its `lpips` / `psnr` / `ssim`
are `null` and render as "—".

Two prompt sets exist per benchmark. The **public** set will be checked into
the repo at the path `benchmark.json` declares (it lands with the harness),
and results measured on it are `Submitted`. A private **held-out** set is run
only by the maintainers; results re-measured on it are `Verified`, and the
published numbers are the held-out ones. This is what keeps a recipe from
being tuned to the prompts it is scored on.

## Data layout

```
data/benchmarks/<model>/<hardware>/
├── benchmark.json          # protocol shared by every recipe on the page
└── recipes/<id>.json       # one file per recipe; id == filename
```

`benchmark.json` holds the protocol (resolution, batch, steps, precision,
version), both prompt sets, the warmup count, and the
id of the baseline recipe. A recipe file holds the engine (name + version),
the optimization list as `{ technique, method }` pairs, short configuration
notes, the metrics above, the status, which prompt set it was measured on,
the date, and provenance (`configPath`, `commit`, `pr`).

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
