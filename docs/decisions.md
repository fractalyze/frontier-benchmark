# Decisions

What was settled and why. Change these deliberately, in a PR that updates this
page.

- **Objective**: for one model on one GPU, minimize latency subject to a
  quality loss ε against the baseline. The page shows the whole frontier and a
  draggable ε; nothing is ranked by a single score.
- **Baseline** = the engine's native run under the page's protocol, BF16,
  eager. Weights are never changed: distilled or fine-tuned checkpoints are not
  recipes.
- **Quality axis** = one loss against the baseline's output for the same
  prompt and seed: LPIPS mean for image and video, WER increase for speech.
  PSNR, SSIM and ImageReward are shown but never drive the frontier. No FID.
- **Speed axis** = latency of one request. Throughput and concurrency were
  removed (without a load level, images/s is just 1/latency); serving cost may
  return as its own protocol.
- **Verified means re-measured** by the maintainers on a private held-out
  prompt set that is never committed. Submitted means measured on the public
  set by the submitter.
- **Recipe = engine + list of {technique, method}** from a closed list of
  eight techniques. Names are derived from methods so they cannot drift.
- **SageAttention2 is tagged Quantization** (INT8 QK, FP8 PV attention), not
  Sparse Attention or Kernel Optimization.
- **Dominated recipes are not published** when a published recipe beats them
  on both axes (example: Cache-DiT stock on the FP8 stack vs DPCache on the
  same stack). Controls and ablations are not recipes.
- **Main-page cards list the Pareto frontier**, computed by the same function
  as the chart. There are no fixed quality rungs.
- **Workloads drive labels**: `WORKLOADS` in `src/data/frontier.ts` is the only
  place a metric name or unit is written.
- **Protocol version** is per benchmark (`v0.5` for Qwen-Image 2.1, `v0.1` for
  FLUX.2 klein) and bumps when the protocol changes.
- **Harness discipline**: GPU0 only, a lock directory, contention stamps, a
  DIRTY run is never emitted; 10 warmups; held-out prompts are never used as
  warmups.
- **Tooling**: npm on Node 22, vitest, eslint with prettier; Python harness in
  its own venv. No CI yet.
