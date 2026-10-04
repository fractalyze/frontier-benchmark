# bench — the measurement harness

Scope: what the harness does, what its numbers mean, and how to set it up.
Procedures live in [docs/adding-a-recipe.md](../docs/adding-a-recipe.md) and
[docs/adding-a-model.md](../docs/adding-a-model.md).

Re-measures a recipe on this machine's RTX 5090 and writes the numbers back into
`data/`. One command per recipe:

```bash
python -m bench.run \
  --recipe dpcache-k20 \
  --prompts "$BENCH_HELDOUT" --prompt-set heldout-v1 \
  --runs "$BENCH_RUNS/heldout-v1"
```

That renders the baseline first if it has not been rendered into `--runs`, renders
the recipe, scores it against the baseline, and rewrites
`data/benchmarks/<model>/<hw>/recipes/<id>.json` (metrics, `status: Verified`,
`measuredOn: held-out`, date) plus `promptSets["held-out"]` in `benchmark.json`.
`--no-emit` renders and scores only (smoke tests, public-set parity checks);
`--measured-on public` keeps a recipe `Submitted`.

## Pieces

| module                 | does                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol.py`          | `benchmark.json` protocol + recipe `configPath` → engine kwargs, process env, request kwargs. Pure.                                                                                                                              |
| `prompts.py`           | loads a corpus file (`splits.<name>[]` of `{pair_id, prompt, seed, category}`).                                                                                                                                                  |
| `render.py`            | one engine configuration per process: load once, 10 warmup renders on calibration prompts, then every pair timed (client wall, `peak_memory_mb`) with a contention stamp. Writes PNGs, `rows.jsonl`, `manifest.json`.            |
| `score.py`             | LPIPS (AlexNet, CPU FP32), PSNR, SSIM vs the baseline image of the same prompt+seed on white-composited RGB; ImageReward (absolute) through `image_reward_worker.py`. Writes `scores.json`.                                      |
| `emit.py`              | run → recipe JSON. Refuses a DIRTY run. Pure `apply()` is unit-tested.                                                                                                                                                           |
| `run.py`               | holds the GPU lock and chains the three.                                                                                                                                                                                         |
| `calibrate.py`         | records the engine's DPCache calibration captures under a recipe's runtime (`sglang.multimodal_gen.tools.dpcache_calibrate record`/`plan`) and writes one schedule per budget to `configs/dpcache-<recipe>/K<budget>.json`.      |
| `env.py`, `sampler.py` | GPU0 pin, lock directories, `nvidia-smi` stamps and under-load clock/temperature sampling (from qwen-image-opt).                                                                                                                 |
| `speech.py`            | speech pages: checkpoint registry, recipe → `SpeechSpec` (engine checkout, deploy config, MPS, env switches), prompt loading, WER sums. Pure.                                                                                    |
| `speak.py`             | serves one speech recipe (`vllm serve --omni`, under a private CUDA MPS daemon when the recipe asks), sends the warmups, then every prompt `--repeats` times; writes each reply's text and audio, `rows.jsonl`, `manifest.json`. |
| `score_speech.py`      | text WER vs the baseline's replies and ASR WER (Qwen3-ASR-1.7B on vLLM) of every reply's audio vs its own text. Writes `scores.json`.                                                                                            |

`protocol.MODELS` maps a benchmark's model slug to its checkpoint (repo, pinned
revision, engine model id); `protocol.offload` picks the residency (`none` keeps
every component on the GPU, as FLUX.2 klein 4B does). Pass `--model` to
`bench.run` / `bench.emit` for anything but Qwen-Image 2.1.

The three recipe config shapes (`sglang-runtime`, a DPCache schedule file,
`sglang-cache-dit-params`) and the calibration command are described in
[docs/adding-a-recipe.md](../docs/adding-a-recipe.md#1-describe-the-configuration).

`run.py` reads `benchmark.json.workload`: a speech page goes through `speak` and
`score_speech` instead of `render` and `score`, and `--repeats` (default 3) sets
how many times each prompt is sent.

## What a number means

- **latencyS**: median client wall time over the prompt set's renders, one request
  at a time, after 10 warmups, model loaded once. Every render is stamped; a foreign
  process on the GPU marks the run DIRTY and `emit` refuses it.
- **peakVramGb**: the engine's reported peak allocated memory over those renders.
- **lpips / psnr / ssim**: pairwise against the baseline recipe's image for the same
  prompt and seed (the baseline is `benchmark.json.baselineRecipe`); the baseline's
  own values are `null`.
- **imageReward**: ImageReward-v1.0 of (prompt, image), absolute, baseline included.
- **speech latencyS**: median time to first audio (request sent to the first audio
  chunk of the streamed reply) over every prompt × repeat, one request at a time,
  after 3 warmups. `peakVramGb` is `null`: vLLM-Omni reserves a fixed share of the
  card per stage.
- **speech wer**: each prompt's reply text against the baseline's reply for the same
  prompt and seed, normalized with openai-whisper's `EnglishTextNormalizer`,
  word-weighted over the prompts; `max` is the worst prompt. The thinker decodes
  greedily, so 0 means the recipe said the same words. Null for the baseline.
- **speech asrWer**: every reply's audio transcribed by Qwen3-ASR-1.7B and scored
  against that reply's own text, baseline included. Shown, never the frontier: the
  talker samples, so audio is not compared across recipes.
- **held-out**: the private corpus (`BENCH_HELDOUT`), 10 fresh prompts x 2 seeds,
  is never committed. A recipe measured on it is `Verified`.

## Environment

The engine is the `qi21/showcase` branch of fractalyze/sglang (DPCache and the
FP8/SageAttention2/fused-kernel stack), installed editable into the harness venv
(torch 2.13+cu130). ImageReward needs transformers 4.x, so it lives in a second
venv named by `IMAGE_REWARD_PYTHON`. JIT kernels compile against a CUDA 13
toolkit (`BENCH_CUDA_HOME`). Every machine-specific location is an environment
variable; the defaults in `bench/env.py`, `bench/run.py` and `bench/score.py`
are the reference machine's.

| variable              | meaning                                                         |
| --------------------- | --------------------------------------------------------------- |
| `BENCH_GPU`           | the one GPU index the harness pins (default `0`)                |
| `HF_HOME`             | Hugging Face cache holding the pinned checkpoints               |
| `BENCH_HELDOUT`       | private held-out corpus (`splits.heldout[]`, never committed)   |
| `BENCH_RUNS`          | root for run directories                                        |
| `BENCH_CUDA_HOME`     | CUDA toolkit for JIT kernels                                    |
| `IMAGE_REWARD_PYTHON` | python of the ImageReward venv                                  |
| `BENCH_GPU_LOCKS`     | colon-separated lock directories sibling jobs honour            |
| `BENCH_VLLM_OMNI`     | speech engines: `<version>/` checkouts, `venv-<version>/` venvs |
| `BENCH_ASR_ENGINE`    | which engine venv serves the ASR model (default `379804a6`)     |

```bash
SGLANG=$HOME/src/sglang-showcase            # any location
git clone --branch qi21/showcase --single-branch https://github.com/fractalyze/sglang.git "$SGLANG"
uv venv .venv --python 3.12 && source .venv/bin/activate
uv pip install --prerelease=allow --index-strategy unsafe-best-match \
  --extra-index-url https://download.pytorch.org/whl/cu130 torch==2.13.0 torchvision \
  -e "$SGLANG/python[diffusion]" lpips scikit-image nvidia-cudnn-frontend pytest \
  <sageattention-2.2.0 wheel built for sm_120>
uv venv .venv-ir --python 3.12
uv pip install --python .venv-ir/bin/python --index-strategy unsafe-best-match \
  --extra-index-url https://download.pytorch.org/whl/cu130 torch==2.13.0 torchvision "transformers<4.50" "huggingface_hub<1" setuptools
uv pip install --python .venv-ir/bin/python --no-build-isolation image-reward "clip @ git+https://github.com/openai/CLIP.git"
export IMAGE_REWARD_PYTHON=$PWD/.venv-ir/bin/python
```

Tests: `python -m pytest` from the repo root (`pytest.ini`), harness venv activated.
