# Adding a model × hardware benchmark

A benchmark page is one model on one GPU with its own protocol and baseline.
Five places change; the loader and tests catch a missing one.

## 1. Catalogue (`src/data/frontier.ts`)

Add the model to `MODELS` with its `workload` (`image`, `video`, `speech`), and
the GPU to `HARDWARE` if new. If the workload is new, add an entry to
`WORKLOADS` (label, caption, quality key/name/format, latency axis/format) and
its quality key to `RecipeFileSchema.metrics` in `src/data/schema.ts`.

## 2. Harness registry (`bench/protocol.py`)

Add the checkpoint to `MODELS`: Hugging Face repo, the pinned snapshot revision
and the engine's model id. The revision must be the one any DPCache schedule was
calibrated for. Download it into `$HF_HOME` first. If the
model needs a residency other than the two existing `OFFLOAD` entries, add one.

## 3. Benchmark file

`data/benchmarks/<model>/<hardware>/benchmark.json` with `workload`, the
protocol (resolution, batch, steps, precision, guidance, attention backend,
offload mode, protocol version starting at `v0.1`), both prompt sets and
`baselineRecipe`. The public set must be a file under `data/prompts/`; reuse an
existing corpus if the prompts are model-agnostic.

## 4. Baseline recipe

`recipes/<baseline>.json` with `optimization: []`, `configPath: null`, the
engine, and placeholder metrics. Measure it first; every other recipe is scored
against its outputs.

## 5. Recipes

Follow [adding-a-recipe.md](adding-a-recipe.md) for each configuration.

## Tests to touch

- `src/data/frontier.test.ts`: the list of loaded benchmarks and a
  recipe-count test for the new page.
- `bench/tests/test_protocol.py`: a spec test for the new model's baseline
  (model id, pinned revision, offload).

## Checks

```bash
python -m pytest -q
npm test && npx eslint . && npm run build
```

Screenshot the main page (a new card appears under its workload section) and
the new benchmark page before opening the PR.
