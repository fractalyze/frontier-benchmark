"""Render one recipe over a prompt set and time every request.

One process = one engine configuration (SGLANG_* knobs are read by the worker
at import, so `run.py` launches this as a subprocess with the recipe's env).
Writes `<out>/<pair_id>.png`, `rows.jsonl` (one row per request, with the
contention stamp) and `manifest.json` (stack, resolved kwargs, summaries).

    python -m bench.render --model qwen-image-2.1 --hardware rtx5090 \
        --recipe dpcache-k20 --prompts "$BENCH_HELDOUT" \
        --out "$BENCH_RUNS/heldout-v1/dpcache-k20"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import env  # noqa: E402  pins CUDA_VISIBLE_DEVICES / HF_HOME before torch
from bench import protocol, prompts  # noqa: E402
from bench.sampler import ClockSampler, MemorySampler, stats  # noqa: E402

WARMUP_PROMPTS = [
    # the DPCache study's calibration prompts: already seen by every schedule,
    # so a warmup never touches a held-out pair
    'A vintage travel poster with the words "VISIT MARS" in bold letters over a red desert landscape',
    "A young woman with curly hair reading a newspaper on a subway train, candid photo",
    "A stack of three books with a pair of glasses on top, next to a steaming mug, on a desk under a lamp",
    "A futuristic city street at night with flying cars, holographic billboards and wet pavement",
    "A children's book illustration of a fox and a rabbit sharing an umbrella in the rain",
]


def _ver(mod: str) -> str:
    try:
        from importlib.metadata import version
        return version(mod)
    except Exception:
        return "?"


def _sha16(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", required=True)
    ap.add_argument("--hardware", required=True)
    ap.add_argument("--recipe", required=True)
    ap.add_argument("--prompts", required=True, help="corpus JSON")
    ap.add_argument("--split", default="heldout")
    ap.add_argument("--out", required=True, type=pathlib.Path)
    ap.add_argument("--warmups", type=int, default=10,
                    help="thermal warmup renders before any timed request")
    ap.add_argument("--limit", type=int, default=None, help="render only the first N pairs (smoke)")
    ap.add_argument("--quiet-budget", type=float, default=1800.0,
                    help="seconds to wait for a window with no foreign GPU process")
    ap.add_argument("--retries", type=int, default=3,
                    help="re-render rounds for pairs a foreign process overlapped")
    return ap


def main() -> int:
    args = build_parser().parse_args()
    spec = protocol.spec_for(args.model, args.hardware, args.recipe)
    for key, value in spec.env.items():
        if os.environ.get(key) != value:
            print(f"REFUSING: env {key}={os.environ.get(key)!r}, recipe needs {value!r}; "
                  f"launch through bench.run", file=sys.stderr)
            return 2
    pairs = prompts.load_pairs(args.prompts, args.split)
    if args.limit:
        pairs = pairs[: args.limit]
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    before = env.wait_for_quiet(budget_s=args.quiet_budget)

    server = dict(spec.server)
    staged = None
    if spec.schedule is not None:
        # the server validates every *.json in the directory, so stage only ours
        staged = tempfile.mkdtemp(prefix="dpcache-", dir=str(out))
        pathlib.Path(staged, f"K{spec.schedule['num_full_steps']}.json").write_text(json.dumps(spec.schedule))
        server["dpcache_schedule_dir"] = staged

    from sglang.multimodal_gen.runtime.entrypoints.diffusion_generator import DiffGenerator

    t0 = time.perf_counter()
    with MemorySampler(env.BENCH_GPU) as load_mem:
        gen = DiffGenerator.from_pretrained(**server)
    load_s = time.perf_counter() - t0
    print(f"load: {load_s:.1f}s {load_mem.summary()}", flush=True)

    rows_path = out / "rows.jsonl"
    rows_path.unlink(missing_ok=True)

    def one(prompt: str, seed: int, png: pathlib.Path | None) -> tuple[float, float]:
        kwargs = dict(spec.request, prompt=prompt, seed=seed)
        t = time.perf_counter()
        result = gen.generate(sampling_params_kwargs=kwargs)
        wall = time.perf_counter() - t
        if isinstance(result, list):
            if len(result) != 1:
                raise RuntimeError(f"expected one output, got {len(result)}")
            result = result[0]
        if result is None or result.frames is None:
            raise RuntimeError("generate() produced no image (the request failed)")
        if png is not None:
            from PIL import Image
            Image.fromarray(result.frames[0]).save(png)
        return wall, float(result.peak_memory_mb or 0)

    try:
        for i in range(args.warmups):
            wall, _ = one(WARMUP_PROMPTS[i % len(WARMUP_PROMPTS)], 1000 + i, None)
            print(f"  warmup{i}: {wall:.3f}s", flush=True)

        rows: dict[str, dict] = {}
        stamps: list[dict] = []
        with MemorySampler(env.BENCH_GPU) as mem, ClockSampler(env.BENCH_GPU) as clk:
            todo = list(pairs)
            for attempt in range(args.retries + 1):
                if not todo:
                    break
                if attempt:
                    print(f"retry {attempt}: {len(todo)} pair(s) overlapped a foreign process", flush=True)
                    env.wait_for_quiet(budget_s=args.quiet_budget)
                dirty = []
                for pair in todo:
                    png = out / f"{pair['pair_id'].replace(':', '_')}.png"
                    stamp_before = env.gpu_stamp()
                    wall, peak_mb = one(pair["prompt"], pair["seed"], png)
                    stamp_after = env.gpu_stamp()
                    stamps += [stamp_before, stamp_after]
                    row = dict(pair, png=png.name, sha16=_sha16(png), wall_s=wall,
                               peak_memory_mb=peak_mb, stamp=stamp_before, stamp_after=stamp_after,
                               attempt=attempt, dirty=env.is_dirty(stamp_before, stamp_after))
                    rows[pair["pair_id"]] = row
                    if row["dirty"]:
                        dirty.append(pair)
                    print(f"  {pair['pair_id']}: {wall:.3f}s{' DIRTY' if row['dirty'] else ''}", flush=True)
                todo = dirty
        with rows_path.open("w") as fh:
            for pair in pairs:
                fh.write(json.dumps(rows[pair["pair_id"]]) + "\n")
        walls = [rows[p["pair_id"]]["wall_s"] for p in pairs]
        peaks = [rows[p["pair_id"]]["peak_memory_mb"] for p in pairs]
    finally:
        gen.shutdown()
        if staged:
            shutil.rmtree(staged, ignore_errors=True)
    after = env.gpu_stamp()

    manifest = dict(
        recipe=args.recipe, model=args.model, hardware=args.hardware,
        prompts=str(pathlib.Path(args.prompts).resolve()), split=args.split,
        corpus_sha256=prompts.corpus_sha256(args.prompts), pairs=len(pairs),
        warmups=args.warmups,
        stack={m: _ver(m) for m in ("sglang", "torch", "diffusers", "transformers", "sageattention")},
        sglang_commit=_git_head(),
        server_kwargs=server if not staged else {**server, "dpcache_schedule_dir": "<staged>"},
        request_kwargs=spec.request, env=spec.env,
        knob_env={k: v for k, v in sorted(os.environ.items())
                  if k.startswith(("SGLANG_", "CACHE_DIT_")) or k in ("CUDA_HOME", "PYTHONPATH")},
        load_s=load_s, memory_at_load=load_mem.summary(), memory=mem.summary(),
        under_load=clk.summary(), wall=stats(walls), walls_temporal_s=walls,
        peak_memory_mb=max(peaks) if peaks else None,
        # a run is DIRTY only if a pair stayed overlapped after every retry;
        # the retries and every stamp are kept in rows.jsonl
        dirty=any(r["dirty"] for r in rows.values()),
        dirty_retries=sum(1 for r in rows.values() if r["attempt"]),
        loadavg=os.getloadavg(),
        stamps_before_after=[before, after],
    )
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: manifest[k] for k in ("wall", "memory", "peak_memory_mb", "under_load", "dirty")}, indent=2))
    print("DIRTY" if manifest["dirty"] else "CLEAN")
    print("RENDER_OK")
    return 0


def _git_head() -> str | None:
    try:
        import sglang, subprocess
        root = pathlib.Path(sglang.__file__).resolve().parents[1]
        return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


if __name__ == "__main__":
    raise SystemExit(main())
