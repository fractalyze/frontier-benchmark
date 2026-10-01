---
name: frontier-benchmark-recipes
description: Maintainer-side skill for the Inference Frontier repo — measure and publish an optimization recipe, or add a new model × hardware benchmark page (data/benchmarks JSON + the bench/ harness on the reference machine). Use when asked to add a recipe, add a model or GPU, measure or verify a configuration, fix "non-baseline recipe is missing lpips", or update a page's numbers.
---

# Inference Frontier: recipes and models (maintainers)

Outside contributors submit a config + recipe JSON in a PR; we measure it on
the reference machine. The procedures live in the repo docs and are the
single source of truth; this skill only routes you to them and keeps the
checklist in one place.

| task                               | read and follow                                                |
| ---------------------------------- | -------------------------------------------------------------- |
| one new recipe on an existing page | `docs/adding-a-recipe.md` (steps 1–5, "Done when")             |
| a new model × GPU page             | `docs/adding-a-model.md`, then `adding-a-recipe.md` per recipe |
| what a field or a number means     | `docs/data-model.md`, `bench/README.md`                        |
| after the merge                    | `docs/deploy.md`                                               |

Prerequisites on the reference machine: harness venv activated, Node 22
selected (`source ~/.nvm/nvm.sh && nvm use 22`), and the environment
variables from `bench/README.md` set (`BENCH_HELDOUT`, `BENCH_RUNS`,
`BENCH_GPU_LOCKS`, `HF_HOME`, …). Never write a machine path into the repo.

## Checklist before the PR

- [ ] No recipe with placeholder metrics left in `data/`
- [ ] Hard-coded counts in `src/data/frontier.test.ts` updated
- [ ] `python -m pytest -q`, `npm test`, `npx eslint .`, `npm run build` green
- [ ] Main page and benchmark page screenshotted (headless Chromium)
- [ ] Commit title `type: summary`; numbers vs their source stated in the PR
- [ ] After merge: deploy from `main` (`docs/deploy.md`)

## Gotchas not obvious from the docs

- The GPU lock is re-taken by sibling sessions within seconds: queue a long
  job in a background script that polls every 2 s and retries on
  `refusing to measure`.
- `pkill -f` / `pgrep -f` patterns can match your own shell; write them as
  `name[.]sh`.
- Vercel deploys run from a clean rsync copy, never the working tree.
