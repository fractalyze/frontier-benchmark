# bench — the measurement harness

Procedures for adding recipes and models live in `docs/adding-a-recipe.md` and
`docs/adding-a-model.md`; this page documents the harness itself.

Re-measures a recipe on this machine's RTX 5090 and writes the numbers back into
`data/`. One command per recipe:

```bash
/data/a41/frontier-venv/bin/python -m bench.run \
  --recipe dpcache-k20 \
  --prompts /data/a41/frontier-heldout/heldout-v1.json --prompt-set heldout-v1 \
  --runs /data/a41/frontier-runs/heldout-v1
```

That renders the baseline first if it has not been rendered into `--runs`, renders
the recipe, scores it against the baseline, and rewrites
`data/benchmarks/<model>/<hw>/recipes/<id>.json` (metrics, `status: Verified`,
`measuredOn: held-out`, date) plus `promptSets["held-out"]` in `benchmark.json`.
`--no-emit` renders and scores only (smoke tests, public-set parity checks);
`--measured-on public` keeps a recipe `Submitted`.

## Pieces

| module                 | does                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol.py`          | `benchmark.json` protocol + recipe `configPath` → engine kwargs, process env, request kwargs. Pure.                                                                                                                         |
| `prompts.py`           | loads a corpus file (`splits.<name>[]` of `{pair_id, prompt, seed, category}`).                                                                                                                                             |
| `render.py`            | one engine configuration per process: load once, 10 warmup renders on calibration prompts, then every pair timed (client wall, `peak_memory_mb`) with a contention stamp. Writes PNGs, `rows.jsonl`, `manifest.json`.       |
| `score.py`             | LPIPS (AlexNet, CPU FP32), PSNR, SSIM vs the baseline image of the same prompt+seed on white-composited RGB; ImageReward (absolute) through `image_reward_worker.py`. Writes `scores.json`.                                 |
| `emit.py`              | run → recipe JSON. Refuses a DIRTY run. Pure `apply()` is unit-tested.                                                                                                                                                      |
| `run.py`               | holds the GPU lock and chains the three.                                                                                                                                                                                    |
| `calibrate.py`         | records the engine's DPCache calibration captures under a recipe's runtime (`sglang.multimodal_gen.tools.dpcache_calibrate record`/`plan`) and writes one schedule per budget to `configs/dpcache-<recipe>/K<budget>.json`. |
| `env.py`, `sampler.py` | GPU0 pin, lock directories, `nvidia-smi` stamps and under-load clock/temperature sampling (from qwen-image-opt).                                                                                                            |

`protocol.MODELS` maps a benchmark's model slug to its checkpoint (repo, pinned
revision, engine model id); `protocol.offload` picks the residency (`none` keeps
every component on the GPU, as FLUX.2 klein 4B does). Pass `--model` to
`bench.run` / `bench.emit` for anything but Qwen-Image 2.1.

Recipe config files (`configs/<id>.json`, pointed to by `configPath`) come in three
shapes: a DPCache schedule artifact (served through `dpcache_schedule_dir`,
requested as `dpcache_budget`), `sglang-cache-dit-params`, or `sglang-runtime`
(`server` kwargs, `env` knobs, `request` fields merged over the protocol). An
`sglang-runtime` config may also name a `dpcache_schedule` (repo-relative path)
to stack DPCache on that runtime; a schedule is bound to the attention backend
and checkpoint it was calibrated for, so a runtime that changes either needs its
own (`python -m bench.calibrate --recipe <id> --budgets 12 16 20 ...`).

## What a number means

- **latencyS**: median client wall time over the prompt set's renders, one request
  at a time, after 10 warmups, model loaded once. Every render is stamped; a foreign
  process on the GPU marks the run DIRTY and `emit` refuses it.
- **peakVramGb**: the engine's reported peak allocated memory over those renders.
- **lpips / psnr / ssim**: pairwise against the baseline recipe's image for the same
  prompt and seed (the baseline is `benchmark.json.baselineRecipe`); the baseline's
  own values are `null`.
- **imageReward**: ImageReward-v1.0 of (prompt, image), absolute, baseline included.
- **held-out**: `/data/a41/frontier-heldout/heldout-v1.json` is 10 fresh prompts x 2
  seeds and is never committed. A recipe measured on it is `Verified`.

## Environment

The engine is the `qi21/showcase` branch of fractalyze/sglang (DPCache and the
FP8/SageAttention2/fused-kernel stack), checked out at `/data/a41/sglang-showcase`
and installed editable into `/data/a41/frontier-venv` (torch 2.13+cu130). ImageReward
needs transformers 4.x, so it lives in `/data/a41/frontier-ir-venv`
(`IMAGE_REWARD_PYTHON` overrides the path). JIT kernels compile with
`CUDA_HOME=/data/a41/qwen-image-opt/cuda-home-13` (`BENCH_CUDA_HOME`).

```bash
git -C ~/Workspace/sglang-jz worktree add --detach /data/a41/sglang-showcase origin/qi21/showcase
uv venv /data/a41/frontier-venv --python 3.12
uv pip install --python /data/a41/frontier-venv/bin/python --prerelease=allow --index-strategy unsafe-best-match \
  --extra-index-url https://download.pytorch.org/whl/cu130 torch==2.13.0 torchvision \
  -e "/data/a41/sglang-showcase/python[diffusion]" lpips scikit-image nvidia-cudnn-frontend pytest \
  /data/a41/qwen-image-opt/wheels/torch2.13/sageattention-2.2.0-cp312-cp312-linux_x86_64.whl
uv venv /data/a41/frontier-ir-venv --python 3.12
uv pip install --python /data/a41/frontier-ir-venv/bin/python --index-strategy unsafe-best-match \
  --extra-index-url https://download.pytorch.org/whl/cu130 torch==2.13.0 torchvision "transformers<4.50" "huggingface_hub<1" setuptools
uv pip install --python /data/a41/frontier-ir-venv/bin/python --no-build-isolation image-reward "clip @ git+https://github.com/openai/CLIP.git"
```

Tests: `/data/a41/frontier-venv/bin/python -m pytest` from the repo root (`pytest.ini`).
