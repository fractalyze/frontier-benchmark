# Adding a recipe

Scope: how one optimization recipe gets onto an existing benchmark page.
Status: current · updated 2026-10-04.

A recipe is one engine configuration measured against the page's baseline.
Field meanings are in [data-model.md](data-model.md); this page is the
procedure. Start a new model × GPU page with [adding-a-model.md](adding-a-model.md).

## Who does what

| step | contributor (pull request)          | maintainer (reference machine)        |
| ---- | ----------------------------------- | ------------------------------------- |
| 1–2  | writes the config and recipe files  | same                                  |
| 3    | optional: numbers on the public set | smoke test, held-out run (`Verified`) |
| 4–5  | —                                   | publish decision, checks, deploy      |

A contributor's PR with placeholder metrics fails `npm test` with
`non-baseline recipe is missing lpips`. That is expected: the maintainers
measure it, fill the numbers and merge it as `Verified`. Contributors who did
measure on the same GPU put their public-set numbers in with
`status: "Submitted"`, `measuredOn: "public"`.

## 1. Describe the configuration

Create `data/benchmarks/<model>/<hardware>/configs/<id>.json`. Start from a
neighbour; `fp8-sage2.json` exists on every page. Three shapes are understood
(`bench/protocol.py` turns them into engine kwargs, process env and request
fields merged over the page's protocol):

**`sglang-runtime`** — the common case.

```json
{
  "schema": "sglang-runtime",
  "note": "one sentence for humans",
  "server": {
    "quantization": "fp8",
    "component_attention_backends": { "transformer": "sage_attn" }
  },
  "env": {},
  "request": {},
  "dpcache_schedule": "data/benchmarks/<model>/<hardware>/configs/dpcache-<id>/K16.json"
}
```

`dpcache_schedule` is optional and stacks a DPCache schedule on this runtime.

**A DPCache schedule file** (`full_steps`, `num_full_steps`, `request`),
written by `bench.calibrate`; the harness serves it through
`dpcache_schedule_dir` and requests it as `dpcache_budget`.

**`sglang-cache-dit-params`** — Cache-DiT with its parameters.

A DPCache schedule is bound to the attention backend and checkpoint it was
calibrated for. A runtime that changes either needs its own schedule:

```bash
python -m bench.calibrate --recipe <id> --budgets 12 16 20 --prompts "$BENCH_HELDOUT" --capture-dir "$BENCH_RUNS/calib-<id>"
```

(`bench.calibrate` builds its spec without the schedule it is about to create,
so pass any server kwargs the runtime needs as `--component-quantizations.<component>=<method>`.)

## 2. Write the recipe file

Create `data/benchmarks/<model>/<hardware>/recipes/<id>.json`. The `id` is
the filename. This is the complete placeholder form; everything under
`metrics` is overwritten by the harness:

```json
{
  "id": "<id>",
  "engine": {
    "name": "sglang-diffusion",
    "version": "<exact commit>",
    "url": "https://github.com/fractalyze/sglang/tree/qi21/showcase"
  },
  "optimization": [
    { "technique": "Quantization", "method": "FP8 W8A8" },
    { "technique": "Quantization", "method": "SageAttention2" }
  ],
  "configuration": ["what a reader needs to reproduce the run, one item per line"],
  "configPath": "data/benchmarks/<model>/<hardware>/configs/<id>.json",
  "metrics": {
    "latencyS": 1,
    "peakVramGb": null,
    "lpips": null,
    "psnr": null,
    "ssim": null,
    "imageReward": null
  },
  "status": "Experimental",
  "measuredOn": "public",
  "date": "<YYYY-MM-DD>",
  "sourceUrl": null,
  "pr": null
}
```

`technique` must be one of the nine in [data-model.md](data-model.md#recipesidjson);
the display name is derived from the methods (`FP8 W8A8 + SageAttention2`).
When the joined methods are too long for a table row, set an optional
`"name"` (`"Megakernels"`); the dialog still lists every method. Check that the harness resolves the recipe before
touching a GPU:

```bash
python -c "from bench import protocol; print(protocol.spec_for('<model>', '<hardware>', '<id>'))"
```

## 3. Smoke, then measure (maintainers)

The harness needs the reference GPU, the engine checkout and the private
held-out corpus; environment variables name every machine-specific location
(table in [bench/README.md](../bench/README.md#environment)).

```bash
# repo root, harness venv activated, Node 22 selected
# smoke: 2 pairs, 2 warmups, no emit — proves the config loads and runs
python -m bench.run --model <model> --recipe <id> --prompts "$BENCH_HELDOUT" \
  --prompt-set smoke --runs "$BENCH_RUNS/<model>-smoke" --warmups 2 --limit 2 --no-emit --no-image-reward
# full held-out run: renders the baseline first if missing, scores, rewrites recipes/<id>.json as Verified
python -m bench.run --model <model> --recipe <id> --prompts "$BENCH_HELDOUT" \
  --prompt-set heldout-v1 --runs "$BENCH_RUNS/<model>/heldout-v1"
```

The run takes the GPU lock (`BENCH_GPU_LOCKS`) and refuses to start while
another holder has it; sibling sessions re-take the lock within seconds, so
queue long jobs in a background script that polls every 2 s and retries on
`refusing to measure`. A foreign process overlapping a run marks it DIRTY and
`emit` refuses it. To re-emit a finished run later:

```bash
python -m bench.emit --model <model> --hardware <hardware> --recipe <id> --run "$BENCH_RUNS/<model>/heldout-v1/<id>" --prompt-set heldout-v1
```

## 4. Decide whether to publish

Publish a recipe only if it is a real point: on the Pareto frontier, or close
enough to inform a choice. A recipe that a published one beats on both axes
(slower and no better loss) is not published: delete its placeholder files,
keep the run directory, and say so in the PR
([decisions.md](decisions.md#recipes)).

## 5. Checks, screenshot, PR, deploy

```bash
source ~/.nvm/nvm.sh && nvm use 22
python -m pytest -q
npm test && npx eslint . && npm run build
```

Update the recipe count in `src/data/frontier.test.ts`. Screenshot the
benchmark page from `npm run dev` with headless Chromium. Commit as
`feat: …` (no scope), open a PR, merge, then deploy from `main`
([deploy.md](deploy.md)).

## Extension points

A recipe JSON needs no code change as long as it uses an existing technique,
any method name, and a config in one of the three shapes. Three things are
deliberately closed lists; each is one edit plus one test:

| to add                      | edit                                                                                  | test                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| a tenth technique           | the `TECHNIQUES` array in `src/data/schema.ts`                                        | `npm test` (a recipe using it loads)                                        |
| a fourth config shape       | an `elif config.get("schema") == "<name>"` branch in `run_spec` (`bench/protocol.py`) | a `run_spec` case in `bench/tests/test_protocol.py`, like the existing ones |
| an engine other than sglang | `render.py` (how a process loads and serves it) and the `engine` block of the recipe  | a smoke run; `score.py` and `emit.py` are engine-agnostic                   |

`method` is free text, so a new technique is only needed when none of the
nine describes the mechanism (Stage Scheduling was the ninth, added with the
Qwen3-Omni page for its serving changes). Techniques stay a closed list so names cannot
drift between pages ([decisions.md](decisions.md#recipes)). A new quality
metric or workload is a model-level change: see
[adding-a-model.md](adding-a-model.md#1-catalogue-the-model-srcdatafrontierts).

## Done when

- [ ] `configs/<id>.json` and `recipes/<id>.json` exist; `protocol.spec_for` resolves
- [ ] recipe is `Verified` on the held-out set (or `Submitted` on the public set from outside)
- [ ] no placeholder metrics anywhere under `data/`
- [ ] pytest, `npm test`, `npx eslint .`, `npm run build` green; page screenshotted
- [ ] merged, deployed, and the page shows the new point
