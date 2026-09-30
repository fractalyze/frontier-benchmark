"""Re-measure one recipe end to end: render, score against the baseline, emit.

    python -m bench.run --recipe dpcache-k20 \
        --prompts /data/a41/frontier-heldout/heldout-v1.json --prompt-set heldout-v1 \
        --runs /data/a41/frontier-runs/heldout-v1

The baseline recipe is rendered first if its run directory has no scores yet.
Render runs as a subprocess so the recipe's SGLANG_* knobs reach the engine
worker at import time; the GPU lock is held across it.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import env, protocol  # noqa: E402

CUDA_HOME = os.environ.get("BENCH_CUDA_HOME", "/data/a41/qwen-image-opt/cuda-home-13")


def render(args, recipe_id: str, out: pathlib.Path, spec: protocol.RunSpec) -> None:
    cmd = [sys.executable, "-m", "bench.render", "--model", args.model, "--hardware", args.hardware,
           "--recipe", recipe_id, "--prompts", args.prompts, "--split", args.split,
           "--out", str(out), "--warmups", str(args.warmups)]
    if args.limit:
        cmd += ["--limit", str(args.limit)]
    child_env = dict(os.environ, CUDA_HOME=CUDA_HOME, **spec.env)
    print("render:", recipe_id, "env:", spec.env, flush=True)
    subprocess.run(cmd, env=child_env, check=True, cwd=str(protocol.REPO))


def score(reference: pathlib.Path | None, candidate: pathlib.Path, image_reward: bool) -> None:
    cmd = [sys.executable, "-m", "bench.score", "--candidate", str(candidate)]
    if reference is not None:
        cmd += ["--reference", str(reference)]
    if not image_reward:
        cmd.append("--no-image-reward")
    subprocess.run(cmd, check=True, cwd=str(protocol.REPO))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="qwen-image-2.1")
    ap.add_argument("--hardware", default="rtx5090")
    ap.add_argument("--recipe", required=True, nargs="+")
    ap.add_argument("--prompts", required=True)
    ap.add_argument("--split", default="heldout")
    ap.add_argument("--prompt-set", required=True)
    ap.add_argument("--measured-on", default="held-out", choices=("public", "held-out"))
    ap.add_argument("--runs", type=pathlib.Path, required=True, help="run directories go under here")
    ap.add_argument("--warmups", type=int, default=10)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--no-emit", action="store_true", help="render and score only (smoke, public parity)")
    ap.add_argument("--no-image-reward", action="store_true")
    ap.add_argument("--rerender", action="store_true", help="ignore an existing run directory")
    args = ap.parse_args()

    benchmark = protocol.load_benchmark(args.model, args.hardware)
    baseline_id = benchmark["baselineRecipe"]
    todo = list(dict.fromkeys([baseline_id] + args.recipe))
    with env.gpu_lock(f"frontier-benchmark {' '.join(todo)}"):
        for recipe_id in todo:
            out = args.runs / recipe_id
            if args.rerender or not (out / "manifest.json").exists():
                render(args, recipe_id, out, protocol.spec_for(args.model, args.hardware, recipe_id))
            if args.rerender or not (out / "scores.json").exists():
                score(None if recipe_id == baseline_id else args.runs / baseline_id, out, not args.no_image_reward)
            if args.no_emit or (recipe_id == baseline_id and baseline_id not in args.recipe):
                continue
            subprocess.run([sys.executable, "-m", "bench.emit", "--model", args.model, "--hardware", args.hardware,
                            "--recipe", recipe_id, "--run", str(out), "--prompt-set", args.prompt_set,
                            "--measured-on", args.measured_on], check=True, cwd=str(protocol.REPO))
    print("RUN_OK", json.dumps(todo))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
