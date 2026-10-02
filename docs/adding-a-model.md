# Adding a model × hardware page

Scope: how a new benchmark page (one model on one GPU) is created end to end.
Status: current · updated 2026-10-02.

A page has its own protocol, its own baseline and its own recipes. Five
places change, in the order below; the loader and the tests name whatever is
missing. The FLUX.2 klein page
(`data/benchmarks/flux-2-klein-4b/rtx5090/`) is the smallest complete example
and the best template to copy.

## Before you start

- The checkpoint is downloaded under `$HF_HOME` and you know the exact
  snapshot revision you will pin.
- The engine (`fractalyze/sglang`, branch `qi21/showcase`) can run the model.
  For a workload the harness has never measured (video, speech) the harness
  needs a new renderer and scorer first; `bench/render.py` and
  `bench/score.py` are image-only. Plan that as its own PR. Until then a page
  can be published from the submitter's own measurements as `Submitted` on
  the public prompts (the Qwen3-Omni speech page does this) and skips the harness commands in steps 2 and 4.

## 1. Catalogue the model (`src/data/frontier.ts`)

Add the model to `MODELS` with its slug, display name and `workload`
(`image`, `video`, `speech`). Add the GPU to `HARDWARE` if it is new. A model
is hidden on the main page until a benchmark exists for it.

If the workload is new, add it to `WORKLOADS` (section label, caption, quality
key/name/method/format and chart scales, latency axis/format/tick spacing),
add its quality key to the recipe schema and its protocol to the
`BenchmarkFileSchema` union in `src/data/schema.ts`, and its header rows to
`protocolRows`. The UI reads every label from
`WORKLOADS`; nothing else hard-codes a metric name.

## 2. Register the checkpoint (`bench/protocol.py`)

```python
MODELS["<model>"] = Model("<hf repo>", "<pinned snapshot revision>", "<engine model id>")
```

The revision must be the one any DPCache schedule is calibrated for. If the
model needs a GPU residency other than the existing `OFFLOAD` entries
(`DiT layerwise`, `text encoder layerwise`, `none`), add one.

## 3. Write `benchmark.json`

`data/benchmarks/<model>/<hardware>/benchmark.json`. Copy the FLUX one (or the
Qwen3-Omni one for speech, whose protocol has `decoding` and `output` instead
of resolution, steps and guidance) and change the values; the directory must
be `<model>/<hardware>` exactly.

```json
{
  "model": "<model>",
  "hardware": "<hardware>",
  "workload": "image",
  "protocol": {
    "version": "v0.1",
    "resolution": "1024x1024",
    "batch": 1,
    "steps": 50,
    "precision": "BF16",
    "guidance": 4.0,
    "attention": "torch_sdpa",
    "offload": "none"
  },
  "promptSets": {
    "public": {
      "name": "comparator-v1",
      "count": 20,
      "path": "data/prompts/qwen-image-2.1-comparator-v1.json"
    },
    "held-out": null
  },
  "timing": "filled in by the harness",
  "baselineRecipe": "sglang-native"
}
```

The public prompt set must be a file under `data/prompts/`; reuse an existing
corpus when the prompts are model-agnostic. `held-out` becomes
`{name, count}` after the first held-out run. The protocol version starts at
`v0.1` and bumps whenever the protocol changes.

## 4. Write the baseline recipe

`recipes/<baselineRecipe>.json` with `optimization: []`, `configPath: null`,
the engine commit and placeholder metrics (the shape is in
[adding-a-recipe.md](adding-a-recipe.md#2-write-the-recipe-file)). Measure it
first: every other recipe is scored against its outputs.

```bash
python -m bench.run --model <model> --hardware <hardware> --recipe <baselineRecipe> \
  --prompts "$BENCH_HELDOUT" --prompt-set heldout-v1 --runs "$BENCH_RUNS/<model>/heldout-v1"
```

## 5. Add recipes

One at a time, following [adding-a-recipe.md](adding-a-recipe.md). A page
with only a baseline renders but shows no frontier.

## Tests to touch

- `src/data/frontier.test.ts`: the list of loaded `model/hardware` pairs and
  a recipe-count test for the new page.
- `bench/tests/test_protocol.py`: a spec test for the new model's baseline
  (model id, pinned revision, offload).

## Done when

- [ ] `MODELS` (both registries), `benchmark.json`, baseline and recipes exist and load
- [ ] baseline and every recipe are `Verified` on the held-out set
- [ ] `python -m pytest -q`, `npm test`, `npx eslint .`, `npm run build` green
- [ ] main page (new card under its workload section) and the new page screenshotted
- [ ] merged and deployed ([deploy.md](deploy.md))
