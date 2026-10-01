# Decisions

Scope: what was settled, why, and what was rejected. Change a decision in a
PR that updates this page. Status: current · updated 2026-10-01.

## Benchmark

- **Objective**: for one model on one GPU, minimize latency subject to a
  quality loss ε against the baseline. The page shows the whole frontier and a
  draggable ε; nothing is ranked by a single score.
- **Baseline** = the engine's native run under the page's protocol, BF16,
  eager. Weights are never changed: distilled or fine-tuned checkpoints are not
  recipes.
- **Quality axis** = one loss against the baseline's output for the same
  prompt and seed: LPIPS mean for image and video, WER increase for speech.
  PSNR, SSIM and ImageReward are shown but never drive the frontier. Rejected:
  FID (needs a distribution, not a pair).
- **Speed axis** = latency of one request. Rejected: throughput and
  concurrency (without a load level, images/s is just 1/latency). Deferred:
  serving cost, which would return as its own protocol.
- **Verified means re-measured** by the maintainers on a private held-out
  prompt set that is never committed; `Submitted` means measured on the public
  set by the submitter (definitions in
  [data-model.md](data-model.md#status-and-prompt-sets)). This is what stops a
  recipe from being tuned to the prompts it is scored on.
- **Protocol version** is per benchmark (`v0.5` for Qwen-Image 2.1, `v0.1` for
  FLUX.2 klein) and bumps when the protocol changes.

## Recipes

- **Recipe = engine + list of {technique, method}** from a closed list of
  eight techniques. Names are derived from methods so they cannot drift.
- **SageAttention2 is tagged Quantization** (INT8 QK, FP8 PV attention), not
  Sparse Attention. Open since 2026-10-01: Kernel Optimization was proposed as
  the tag instead; the six recipes that list it keep Quantization until that
  is decided.
- **Dominated recipes are not published** when a published recipe beats them
  on both axes (example: Cache-DiT stock on the FP8 stack vs DPCache on the
  same stack). Controls and ablations are not recipes either.

## Site

- **Main-page cards list the Pareto frontier**, computed by the same function
  as the chart. Rejected: fixed quality rungs.
- **Workloads drive labels**: `WORKLOADS` in `src/data/frontier.ts` is the only
  place a metric name or unit is written.
- **The quality limit is a grip on the dashed line inside the chart**
  (2026-10-01). Dragging it up or down sets the limit; it slides left or right
  along the line so it can be moved clear of the points, and the line itself
  still drags. Rejected: a slider under the chart (shipped briefly, removed the
  same day: it separated the control from the thing it controls); a grip that
  rides the frontier polyline (offered, declined: the limit is a threshold, not
  a pick of one recipe).
- **Frontier points are solid, dominated points are hollow rings**
  (2026-10-01), so the frontier reads at a glance; points above the limit are
  faded in both cases.

## Harness and tooling

- **Harness discipline**: one pinned GPU (`BENCH_GPU`, default 0), a lock
  directory, contention stamps, a DIRTY run is never emitted; 10 warmups;
  held-out prompts are never used as warmups.
- **Tooling**: npm on Node 22, vitest, eslint with prettier; Python harness in
  its own venv. No CI yet: every check in [AGENTS.md](../AGENTS.md) runs by
  hand before a PR.
