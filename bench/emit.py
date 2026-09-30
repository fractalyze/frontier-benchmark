"""Write a measured run back into data/: the recipe's metrics and status, and
the benchmark's held-out prompt-set record.

Pure JSON manipulation (unit-tested); the CLI reads a run directory's
manifest.json and scores.json.

    python -m bench.emit --model qwen-image-2.1 --hardware rtx5090 \
        --recipe dpcache-k20 --run <runs>/dpcache-k20 --prompt-set heldout-v1
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import protocol  # noqa: E402


def metrics_from(manifest: dict, scores: dict, is_baseline: bool) -> dict:
    s = scores["summary"]
    peak_mb = manifest.get("peak_memory_mb") or (manifest.get("memory") or {}).get("peak_mib")
    return dict(
        latencyS=round(manifest["wall"]["p50"], 3),
        peakVramGb=round(peak_mb / 1024, 1) if peak_mb else None,
        lpips=None if is_baseline else s["lpips"],
        psnr=None if is_baseline else s.get("psnr"),
        ssim=None if is_baseline else s.get("ssim"),
        imageReward=s.get("imageReward"),
    )


def apply(recipe: dict, benchmark: dict, manifest: dict, scores: dict, *,
          prompt_set: str, measured_on: str, date: str, engine_version: str | None) -> tuple[dict, dict]:
    """Return updated (recipe, benchmark) documents; inputs are not mutated."""
    if manifest.get("dirty"):
        raise ValueError("run is DIRTY (a foreign process shared the GPU); refusing to publish it")
    if measured_on not in ("public", "held-out"):
        raise ValueError(f"measuredOn must be public or held-out, got {measured_on!r}")
    is_baseline = recipe["id"] == benchmark["baselineRecipe"]
    if not is_baseline and scores.get("reference") is None:
        raise ValueError("a non-baseline recipe needs a reference (the baseline run) in its scores")
    recipe = json.loads(json.dumps(recipe))
    benchmark = json.loads(json.dumps(benchmark))
    recipe["metrics"] = metrics_from(manifest, scores, is_baseline)
    recipe["status"] = "Verified" if measured_on == "held-out" else "Submitted"
    recipe["measuredOn"] = measured_on
    recipe["date"] = date
    recipe["sourceUrl"] = None  # measured by this repo's harness, not transcribed
    if engine_version:
        recipe["engine"]["version"] = engine_version
    if measured_on == "held-out":
        benchmark["promptSets"]["held-out"] = dict(name=prompt_set, count=int(manifest["pairs"]))
    return recipe, benchmark


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", required=True)
    ap.add_argument("--hardware", required=True)
    ap.add_argument("--recipe", required=True)
    ap.add_argument("--run", type=pathlib.Path, required=True)
    ap.add_argument("--prompt-set", required=True, help="name recorded in promptSets")
    ap.add_argument("--measured-on", default="held-out", choices=("public", "held-out"))
    ap.add_argument("--date", default=dt.date.today().isoformat())
    args = ap.parse_args()
    manifest = json.loads((args.run / "manifest.json").read_text())
    scores = json.loads((args.run / "scores.json").read_text())
    bdir = protocol.benchmark_dir(args.model, args.hardware)
    rpath = bdir / "recipes" / f"{args.recipe}.json"
    bpath = bdir / "benchmark.json"
    recipe, benchmark = apply(
        json.loads(rpath.read_text()), json.loads(bpath.read_text()), manifest, scores,
        prompt_set=args.prompt_set, measured_on=args.measured_on, date=args.date,
        engine_version=(manifest.get("sglang_commit") or "")[:9] or None,
    )
    rpath.write_text(json.dumps(recipe, indent=2) + "\n")
    bpath.write_text(json.dumps(benchmark, indent=2) + "\n")
    print(json.dumps(recipe["metrics"], indent=2))
    print("EMIT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
