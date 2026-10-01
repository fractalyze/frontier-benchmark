"""Calibrate DPCache schedules for a recipe's runtime.

A DPCache schedule is bound to the engine configuration it was recorded under
(attention backend, precision, checkpoint), so a recipe that changes any of
those needs its own schedule. This runs the engine's calibration tool with the
recipe's server kwargs on the study's 10 calibration prompts and writes one
schedule per budget into the recipe's configs directory.

    python -m bench.calibrate --recipe fp8-sage2-kernels --budgets 12 16 20 \
        --prompts "$BENCH_CALIB/calibration-prompts.jsonl" \
        --capture-dir "$BENCH_CALIB/fp8-sage2-kernels"
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
from bench.run import CUDA_HOME  # noqa: E402

TOOL = ["-m", "sglang.multimodal_gen.tools.dpcache_calibrate"]


def server_flags(server: dict) -> list[str]:
    """The calibration tool takes server args as CLI flags."""
    flags: list[str] = []
    for key, value in server.items():
        if key == "component_quantizations":
            for component, method in value.items():
                flags += [f"--component-quantizations.{component}={method}"]
        elif key == "component_quantization_ignored_layers":
            for component, layers in value.items():
                flags += [f"--component-quantization-ignored-layers.{component}", *layers]
        elif key == "component_residency":
            flags += ["--component-residency", *value]
        elif key == "enable_attention_backend_autotune":
            # a ServerArgs field without a CLI flag; its default is already off
            if value:
                raise ValueError("the tool cannot enable attention-backend autotune")
        elif key in ("model_id", "batching_max_size"):
            continue
        elif isinstance(value, bool):
            flags += [f"--{key.replace('_', '-')}", "true" if value else "false"]
        else:
            flags += [f"--{key.replace('_', '-')}", str(value)]
    return flags


def runtime_spec(model: str, hardware: str, recipe_id: str) -> protocol.RunSpec:
    """The recipe's runtime without the schedule this calibration is about to produce."""
    benchmark = protocol.load_benchmark(model, hardware)
    recipe = protocol.load_recipe(model, hardware, recipe_id)
    if not recipe["configPath"]:
        raise ValueError(f"recipe {recipe_id} has no config; nothing to calibrate a schedule against")
    config = json.loads((protocol.REPO / recipe["configPath"]).read_text())
    if config.get("schema") != "sglang-runtime":
        raise ValueError(f"recipe {recipe_id} is not an sglang-runtime config: {config.get('schema')!r}")
    config.pop("dpcache_schedule", None)
    return protocol.run_spec(benchmark, recipe, config)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="qwen-image-2.1")
    ap.add_argument("--hardware", default="rtx5090")
    ap.add_argument("--recipe", required=True)
    ap.add_argument("--prompts", required=True, help="JSONL of {prompt, seed}")
    ap.add_argument("--capture-dir", required=True)
    ap.add_argument("--budgets", type=int, nargs="+", required=True)
    ap.add_argument("--max-gap", type=int, default=8)
    ap.add_argument("--out-dir", default=None, help="default: the recipe's configs directory")
    args = ap.parse_args()

    spec = runtime_spec(args.model, args.hardware, args.recipe)
    req = spec.request
    child_env = dict(os.environ, CUDA_HOME=CUDA_HOME, **spec.env)
    record = [sys.executable, *TOOL, "record", "--prompts-file", args.prompts,
              "--capture-dir", args.capture_dir, "--height", str(req["height"]), "--width", str(req["width"]),
              "--num-inference-steps", str(req["num_inference_steps"]),
              "--guidance-scale", str(req["guidance_scale"]), "--max-gap", str(args.max_gap),
              *server_flags(spec.server)]
    out_dir = pathlib.Path(args.out_dir or protocol.benchmark_dir(args.model, args.hardware) / "configs")
    plan = [sys.executable, *TOOL, "plan", "--capture-dir", args.capture_dir,
            "--budgets", *map(str, args.budgets), "--out-dir", str(out_dir / f"dpcache-{args.recipe}")]
    with env.gpu_lock(f"frontier-benchmark calibrate {args.recipe}"):
        env.wait_for_quiet()
        print("record:", " ".join(record), flush=True)
        subprocess.run(record, env=child_env, check=True, cwd=str(protocol.REPO))
    print("plan:", " ".join(plan), flush=True)
    subprocess.run(plan, env=child_env, check=True, cwd=str(protocol.REPO))
    print("CALIBRATE_OK", out_dir / f"dpcache-{args.recipe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
