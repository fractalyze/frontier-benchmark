---
name: frontier-benchmark-recipes
description: Add, re-measure or publish an optimization recipe, or add a new model × hardware benchmark page, in the Inference Frontier repo (data/benchmarks JSON + the bench/ harness). Use when asked to add a recipe, add a model or GPU, measure or verify a configuration, fix "non-baseline recipe is missing lpips", or update a page's numbers.
---

# Inference Frontier: recipes and models

Reference docs (read the one you need, they are short):
`docs/data-model.md` (fields, workloads, loader rules),
`docs/adding-a-recipe.md`, `docs/adding-a-model.md`, `bench/README.md`,
`docs/deploy.md`.

## Quick start: one new recipe on an existing page

```bash
cd /home/a41/Workspace/frontier-benchmark && source ~/.nvm/nvm.sh && nvm use 22
PY=/data/a41/frontier-venv/bin/python
D=data/benchmarks/<model>/<hardware>
cp $D/configs/fp8-sage2.json $D/configs/<id>.json      # edit server/env/request
cp $D/recipes/fp8-sage2.json $D/recipes/<id>.json      # id, optimization, configuration, configPath, placeholders
$PY -c "from bench import protocol; print(protocol.spec_for('<model>','<hardware>','<id>'))"
$PY -m bench.run --model <model> --recipe <id> --prompts /data/a41/frontier-heldout/heldout-v1.json \
  --prompt-set smoke --runs /data/a41/frontier-runs/<model>-smoke --warmups 2 --limit 2 --no-emit --no-image-reward
$PY -m bench.run --model <model> --recipe <id> --prompts /data/a41/frontier-heldout/heldout-v1.json \
  --prompt-set heldout-v1 --runs /data/a41/frontier-runs/<model>/heldout-v1      # emits Verified metrics
$PY -m pytest -q && npm test && npx eslint . && npm run build
```

## Workflow: add a recipe

1. Config in `configs/<id>.json` (`sglang-runtime` with `server`, `env`,
   `request`, optional `dpcache_schedule`). A DPCache schedule is bound to its
   attention backend and checkpoint; recalibrate with `bench.calibrate` when
   either changes.
2. Recipe file: `id` == filename, exact engine commit, `optimization` as
   `{technique, method}` from the eight techniques, `configPath`, placeholder
   metrics, `status: Experimental`.
3. Smoke (2 pairs, `--no-emit`), then the full held-out run. Both need GPU0
   free: the harness refuses while a lock is held. Queue long jobs in a nohup
   script polling every 2 s; retry on "refusing to measure".
4. Publish only a real frontier point. Dominated on both axes by a published
   recipe → delete the placeholder, keep the run directory, say so in the PR.
5. Update hard-coded counts in `src/data/*.test.ts`, screenshot the page, PR.

## Workflow: add a model × hardware page

1. `src/data/frontier.ts`: `MODELS` entry with `workload`; `HARDWARE` if new;
   a `WORKLOADS` entry + schema metrics key if the workload is new.
2. `bench/protocol.py`: `MODELS[slug] = Model(repo, pinned revision, model_id)`;
   an `OFFLOAD` mode if needed; checkpoint downloaded to `/data/a41/hf-cache`.
3. `benchmark.json` (workload, protocol `v0.1`, prompt sets, baseline id),
   baseline recipe (`optimization: []`, `configPath: null`), then recipes.
4. Tests: benchmark list + recipe count in `frontier.test.ts`; a spec test in
   `bench/tests/test_protocol.py`.

## Checklist before the PR

- [ ] No recipe with placeholder metrics left in `data/`
- [ ] pytest, `npm test`, `npx eslint .`, `npm run build` green
- [ ] Main page and benchmark page screenshotted (Playwright, headless Chromium)
- [ ] Commit title `type: summary`; numbers vs their source stated in the PR
- [ ] After merge: deploy from `main` (`docs/deploy.md`)

## Gotchas

- `bench.calibrate` builds its spec without the schedule it is about to create;
  pass server kwargs as `--component-quantizations.<c>=<m>`.
- Sibling sessions on this box re-take the GPU lock within seconds.
- `pkill -f`/`pgrep -f` patterns can match your own shell: use `name[.]sh`.
- Vercel deploys run from a clean rsync copy, never the working tree.
