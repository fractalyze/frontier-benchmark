"""What a recipe runs: benchmark.json protocol + recipe file + its config file.

Pure functions (no torch, no GPU) so they are unit-testable. The site's zod
schema keeps recipe files strict, so everything the harness needs beyond the
protocol lives in the recipe's `configPath` file. Three config shapes are
understood:

- a DPCache schedule artifact (has `full_steps`): served through
  `dpcache_schedule_dir`, requested with `dpcache_budget = num_full_steps`;
- `sglang-cache-dit-params`: requested with `enable_cache_dit` + `cache_dit_params`;
- `sglang-runtime`: `{"server": {...}, "env": {...}, "request": {...}}`, merged
  over the protocol's baseline kwargs (server kwargs, process env, request kwargs).

The baseline recipe (`configPath: null`) runs the protocol unchanged.
"""

from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen-Image-2.1"
MODEL_REVISION = "790c92633540aa0cb11d9abf19eb46d861714758"
HF_HOME = os.environ.get("HF_HOME", "/data/a41/hf-cache")
# Passed as the model path (not the repo id) so DPCache's checkpoint identity
# resolves to the snapshot revision the published schedules were calibrated for.
MODEL_PATH = f"{HF_HOME}/hub/models--Qwen--Qwen-Image-2.1/snapshots/{MODEL_REVISION}"
if not os.path.isdir(MODEL_PATH):
    MODEL_PATH = f"{HF_HOME}/models--Qwen--Qwen-Image-2.1/snapshots/{MODEL_REVISION}"

# benchmark.json `protocol.offload` -> engine residency. The 17.5 GB Qwen3-VL text
# encoder never fits beside the DiT on a 32 GB card, so it always streams; the
# choice is whether the DiT streams too. Streaming the DiT makes wall time
# hostage to host CPU/memory contention on this shared box (see bench/README.md).
OFFLOAD = {
    "DiT layerwise": {"dit_layerwise_offload": True},
    "text encoder layerwise": {
        "component_residency": ["dit=resident", "text_encoder=layerwise-offload", "vae=resident"]
    },
}


@dataclasses.dataclass(frozen=True)
class RunSpec:
    recipe_id: str
    server: dict
    env: dict
    request: dict
    schedule: dict | None  # a DPCache schedule to stage into a directory


def benchmark_dir(model: str, hardware: str) -> Path:
    return REPO / "data" / "benchmarks" / model / hardware


def load_benchmark(model: str, hardware: str) -> dict:
    return json.loads((benchmark_dir(model, hardware) / "benchmark.json").read_text())


def load_recipe(model: str, hardware: str, recipe_id: str) -> dict:
    return json.loads((benchmark_dir(model, hardware) / "recipes" / f"{recipe_id}.json").read_text())


def baseline_server_kwargs(protocol: dict) -> dict:
    """The engine configuration the protocol fixes; every recipe starts from it."""
    if protocol["precision"] != "BF16":
        raise ValueError(f"protocol precision {protocol['precision']!r} is not supported")
    kwargs = dict(
        model_path=MODEL_PATH,
        model_id="Qwen-Image-2.1",
        num_gpus=1,
        performance_mode="manual",
        attention_backend=protocol["attention"],
        enable_attention_backend_autotune=False,
        enable_torch_compile=False,
        enable_breakable_cuda_graph=False,
        warmup_mode="off",
        batching_max_size=1,
    )
    try:
        kwargs.update(OFFLOAD[protocol["offload"]])
    except KeyError:
        raise ValueError(f"protocol offload {protocol['offload']!r} is not one of {sorted(OFFLOAD)}") from None
    return kwargs


def baseline_request_kwargs(protocol: dict) -> dict:
    width, height = (int(v) for v in protocol["resolution"].split("x"))
    return dict(
        width=width,
        height=height,
        num_inference_steps=int(protocol["steps"]),
        guidance_scale=float(protocol["guidance"]),
        generator_device="cpu",
        num_outputs_per_prompt=int(protocol["batch"]),
        enable_cache_dit=False,
        save_output=False,
        return_file_paths_only=False,
    )


def run_spec(benchmark: dict, recipe: dict, config: dict | None) -> RunSpec:
    protocol = benchmark["protocol"]
    server = baseline_server_kwargs(protocol)
    request = baseline_request_kwargs(protocol)
    env: dict = {}
    schedule = None
    if config is None:
        pass
    elif "full_steps" in config:
        req = config.get("request", {})
        mismatches = {
            "num_inference_steps": (req.get("num_inference_steps"), request["num_inference_steps"]),
            "height": (req.get("height"), request["height"]),
            "guidance_scale": (req.get("guidance_scale"), request["guidance_scale"]),
            "attention_backend": (req.get("attention_backend"), server["attention_backend"]),
            "checkpoint": (req.get("checkpoint"), MODEL_REVISION),
        }
        bad = {k: v for k, v in mismatches.items() if v[0] is not None and v[0] != v[1]}
        if bad:
            raise ValueError(f"DPCache schedule was calibrated for another protocol: {bad}")
        schedule = config
        request["dpcache_budget"] = int(config["num_full_steps"])
    elif config.get("schema") == "sglang-cache-dit-params":
        request["enable_cache_dit"] = True
        request["cache_dit_params"] = dict(config["cache_dit_params"])
    elif config.get("schema") == "sglang-runtime":
        server.update(config.get("server", {}))
        env.update({k: str(v) for k, v in config.get("env", {}).items()})
        request.update(config.get("request", {}))
    else:
        raise ValueError(f"unrecognised config for recipe {recipe['id']}: {config.get('schema')!r}")
    if "component_residency" in server and server.get("dit_layerwise_offload"):
        # a runtime config that keeps the DiT resident replaces the protocol's offload
        server.pop("dit_layerwise_offload")
    return RunSpec(recipe["id"], server, env, request, schedule)


def spec_for(model: str, hardware: str, recipe_id: str) -> RunSpec:
    benchmark = load_benchmark(model, hardware)
    recipe = load_recipe(model, hardware, recipe_id)
    config = json.loads((REPO / recipe["configPath"]).read_text()) if recipe["configPath"] else None
    return run_spec(benchmark, recipe, config)
