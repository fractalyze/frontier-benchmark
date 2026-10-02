# Decisions

Scope: what was settled, why, and what was rejected. Change a decision in a
PR that updates this page. Status: current · updated 2026-10-02.

## Benchmark

- **Objective**: for one model on one GPU, minimize latency subject to a
  quality loss ε against the baseline. The page shows the whole frontier and a
  draggable ε; nothing is ranked by a single score.
- **Baseline** = the engine's native run under the page's protocol, BF16,
  eager (image). A speech page's baseline is the engine's own deploy of the
  page's pinned checkpoint (Qwen3-Omni: AWQ 4-bit, stock vLLM-Omni). Weights are never changed: distilled or fine-tuned checkpoints are not
  recipes.
- **Quality axis** = one loss against the baseline's output for the same
  prompt and seed: LPIPS mean for image and video, ΔWER for speech.
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
- **ΔWER is signed** (2026-10-02): recipe WER minus baseline WER, each reply's
  audio scored against its own text. A recipe can make fewer transcription
  errors than the baseline (Qwen3-Omni `kernels`: −0.58 pp), and clipping that
  at zero would hide a real measurement. LPIPS stays nonnegative.
- **Protocol is per workload** (2026-10-02): `benchmark.json` is a union on
  `workload`; image and video keep resolution/steps/guidance/attention/offload,
  speech has `decoding` and `output`. Rejected: one protocol with optional
  fields (a speech page would silently accept image-only fields).
- **Speech pages are `Submitted`** until `bench/` can render and score speech:
  the harness is image-only, so nothing on a speech page is re-measured on a
  held-out set yet.
- **Protocol version** is per benchmark (`v0.5` for Qwen-Image 2.1, `v0.1` for
  FLUX.2 klein) and bumps when the protocol changes.

## Recipes

- **Recipe = engine + list of {technique, method}** from a closed list of
  nine techniques. Names are derived from methods so they cannot drift.
- **Stage Scheduling** (2026-10-02) is the ninth technique: when the stages of
  a multi-stage pipeline (Qwen3-Omni's thinker, talker and code2wav) run and
  hand data on — early first chunk, frame 0 with the prefill, pre-prefill,
  thinker yield, fast poll, event-driven orchestration. None of the eight
  described it: they change one stage's math or kernels, not the hand-offs.
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
