# Adding a recipe

A recipe is one engine configuration measured against the page's baseline.
Everything below is what `.agents/skills/frontier-benchmark-recipes` walks an
agent through; this page is the reference.

## 1. Describe the configuration

Create `data/benchmarks/<model>/<hardware>/configs/<id>.json`. The harness
understands three shapes (`bench/protocol.py`):

- **`sglang-runtime`** — the common case:
  ```json
  {
    "schema": "sglang-runtime",
    "note": "one sentence for humans",
    "server": {
      "quantization": "fp8",
      "component_attention_backends": { "transformer": "sage_attn" }
    },
    "env": { "SGLANG_ENABLE_…": "1" },
    "request": {},
    "dpcache_schedule": "data/benchmarks/<model>/<hardware>/configs/dpcache-<id>/K16.json"
  }
  ```
  `server` kwargs, `env` and `request` fields are merged over the protocol's
  baseline. `dpcache_schedule` (optional) stacks a DPCache schedule on top.
- **a DPCache schedule file** (`full_steps`, `num_full_steps`, `request`):
  served through `dpcache_schedule_dir`, requested as `dpcache_budget`.
- **`sglang-cache-dit-params`**: Cache-DiT with its params.

A DPCache schedule is bound to the attention backend and checkpoint it was
calibrated for. A runtime that changes either needs its own:
`python -m bench.calibrate --recipe <id> --budgets 12 16 20 --prompts … --capture-dir …`.

## 2. Write the recipe file

Copy a neighbour in `recipes/`, then set:

- `id` = filename; `engine` with the exact commit; `optimization` as
  `{technique, method}` pairs (the name is derived from the methods);
- `configuration` notes; `configPath` to the file from step 1;
- `metrics` as placeholders (`latencyS: 1`, everything else `null`),
  `status: "Experimental"`, `measuredOn: "public"`, `date` today,
  `sourceUrl` if the numbers were reported somewhere, `pr: null`.

A placeholder recipe fails `npm test` ("non-baseline recipe is missing lpips")
until it is measured. Never commit or deploy one. Check the spec resolves:

```bash
python -c "from bench import protocol; print(protocol.spec_for('<model>','<hardware>','<id>'))"
```

## 3. Smoke, then measure (maintainers only)

The harness needs the reference GPU, the engine checkout and the private
held-out corpus, so only maintainers run it. Submitters stop after step 2 (see
"Submitting from outside"). Paths come from the environment:
`BENCH_HELDOUT` (held-out corpus, never in the repo), `BENCH_RUNS` (run root),
plus the harness knobs in `bench/README.md`.

```bash
# from the repo root, with the harness venv activated
PY=python
# 2 pairs, 2 warmups, no emit — proves the config loads and runs
python -m bench.run --model <model> --recipe <id> --prompts $BENCH_HELDOUT \
  --prompt-set smoke --runs $BENCH_RUNS/<model>-smoke --warmups 2 --limit 2 --no-emit --no-image-reward
# full held-out run; renders the baseline first if missing, scores, writes the recipe file
python -m bench.run --model <model> --recipe <id> --prompts $BENCH_HELDOUT \
  --prompt-set heldout-v1 --runs $BENCH_RUNS/<model>/heldout-v1
```

The run refuses to start while a GPU lock directory (`BENCH_GPU_LOCKS`, see
`bench/env.py`) is held, waits for a quiet GPU, and marks a run
DIRTY if a foreign process overlapped it (then `emit` refuses). Sibling sessions
re-take the lock within seconds, so queue long jobs in a script that polls
every 2 s and retries on "refusing to measure". Use `pgrep`/`pkill` patterns
that cannot match your own shell (`pattern[.]sh`).

`bench.emit` can re-emit a finished run later:
`python -m bench.emit --model <model> --hardware <hw> --recipe <id> --run <runs>/<id> --prompt-set heldout-v1`.

## 4. Decide whether to publish

A recipe belongs on the page if it is a real point: on the Pareto frontier, or
close enough to inform a choice. A recipe dominated on both axes by a published
one (slower and no better loss) is not published; keep its run directory and
note it in the PR.

## 5. Checks, screenshots, PR

```bash
source ~/.nvm/nvm.sh && nvm use 22
python -m pytest -q
npm test && npx eslint . && npm run build
```

Screenshot the benchmark page with headless Chromium (Playwright) against
`npx vite dev`. Commit as `feat: …` (no scope in the title), open a
PR, merge, then deploy (see [deploy.md](deploy.md)).

## Submitting from outside

Open a pull request with steps 1–2. If you measured on the same GPU, put your
numbers on the public set in the recipe (`status: "Submitted"`,
`measuredOn: "public"`); otherwise leave the placeholders and say so. Either
way the maintainers run the recipe on the reference machine, write the
held-out numbers and merge it as `Verified`. (A placeholder recipe fails the
tests until then, which is expected for a submission.)
