# Inference Frontier

Latency–quality Pareto frontiers for generative inference, one page per
model × GPU. Each row is a **recipe** (a combination of optimizations) measured
against the engine's native baseline under one fixed protocol. Live at
https://frontier-fractalyze.vercel.app (currently behind Vercel Authentication).

Published pages: Qwen-Image 2.1 × RTX 5090 (10 recipes), FLUX.2 [klein] 4B ×
RTX 5090 (4 recipes) and Qwen3-Omni × RTX 5090 (speech, 3 recipes), all
`Verified` on a private held-out set with the harness in `bench/`.

## Docs

| doc                                                | what it answers                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| [docs/adding-a-recipe.md](docs/adding-a-recipe.md) | how to add one recipe to a page: config, recipe JSON, smoke, measure, publish     |
| [docs/adding-a-model.md](docs/adding-a-model.md)   | how to add a model × GPU page: catalogue, checkpoint, benchmark.json, baseline    |
| [docs/data-model.md](docs/data-model.md)           | what every JSON field means, workloads, status, the rules the loader enforces     |
| [bench/README.md](bench/README.md)                 | the measurement harness: modules, environment variables, what a number means      |
| [docs/deploy.md](docs/deploy.md)                   | how `main` reaches production (Vercel CLI from a clean copy) and the release flow |
| [docs/decisions.md](docs/decisions.md)             | what was settled and what was rejected: benchmark, recipes, site, harness         |
| [AGENTS.md](AGENTS.md)                             | always-on rules for coding agents (shell, checks, GPU lock, commits)              |

Agents: the skill `.agents/skills/frontier-benchmark-recipes` (also linked from
`.claude/skills/`) routes an agent to the doc for adding a recipe or a model.

## Repository map

```
data/benchmarks/<model>/<hardware>/   benchmark.json, recipes/*.json, configs/**
data/prompts/                         public prompt/seed corpora
src/data/                             schema.ts (zod), frontier.ts (loader, WORKLOADS, frontier maths), site.ts
src/routes/                           file-based routes: index.tsx (cards), $model.$hardware.tsx (chart, table, dialog), __root.tsx (head); routeTree.gen.ts is generated
src/components/frontier/              ModelCard, ParetoFigure, ResultsTable (+ RecipeDialog), selects
bench/                                Python harness: protocol, render, score, emit, run, calibrate
public/                               favicon, og.png
```

## Running locally

Node 22 (`.nvmrc`) and npm.

```sh
npm install
npm run dev      # http://localhost:8080 (falls back to the next free port; `--port N --strictPort` to pin)
npm test         # vitest: schema, loader, and component render tests
npm run lint     # eslint (prettier runs as an eslint rule); npm run format rewrites
npm run build    # production build (TanStack Start + nitro)
```

Harness tests: `python -m pytest` from the repo root with the harness venv
activated (see `bench/README.md`).

## Built with

TanStack Start, React 19, Tailwind CSS 4, zod, vitest; sglang-diffusion
(`fractalyze/sglang@qi21/showcase`) for the measurements.
