"""Score a recipe's renders against the baseline's: LPIPS, PSNR, SSIM, ImageReward.

LPIPS (AlexNet, RGB, CPU FP32), PSNR and SSIM (scikit-image defaults, 7x7,
channel_axis=-1) are pairwise against the baseline image of the same prompt and
seed. ImageReward is absolute (prompt, image) and is computed for the baseline
too. RGBA renders are white-composited before scoring; the alpha max-abs
difference is recorded, not gated.

    python -m bench.score --reference <runs>/sglang-native --candidate <runs>/dpcache-k20
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import statistics
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def load_rows(run: pathlib.Path) -> dict[str, dict]:
    rows = [json.loads(l) for l in (run / "rows.jsonl").read_text().splitlines() if l.strip()]
    return {r["pair_id"]: r for r in rows}


def composite(path: pathlib.Path) -> tuple[np.ndarray, np.ndarray]:
    """White-composited RGB uint8 plus the alpha channel (all-255 for RGB)."""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    alpha = arr[..., 3:4] / 255.0
    rgb = arr[..., :3] * alpha + 255.0 * (1.0 - alpha)
    return np.round(rgb).astype(np.uint8), arr[..., 3].astype(np.uint8)


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = float(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2))
    return float("inf") if mse == 0.0 else 10.0 * float(np.log10(255.0 ** 2 / mse))


def summarize(pairs: list[dict]) -> dict:
    """Aggregate per-pair scores into the site's metric shape."""
    def col(k):
        return [p[k] for p in pairs if p.get(k) is not None]
    lp, ps, ss, ir = col("lpips"), col("psnr"), col("ssim"), col("image_reward")
    out = dict(n=len(pairs))
    if lp:
        out["lpips"] = dict(mean=round(statistics.fmean(lp), 4), max=round(max(lp), 4))
        finite = [v for v in ps if np.isfinite(v)]
        out["psnr"] = dict(mean=round(statistics.fmean(finite), 1), min=round(min(finite), 1)) if finite else None
        out["ssim"] = dict(mean=round(statistics.fmean(ss), 4))
        out["identical"] = sum(1 for p in pairs if p.get("pixels_identical"))
        out["alpha_max_abs"] = max(p.get("alpha_max_abs", 0) for p in pairs)
    if ir:
        out["imageReward"] = dict(mean=round(statistics.fmean(ir), 3))
    return out


IMAGE_REWARD_PYTHON = os.environ.get("IMAGE_REWARD_PYTHON", "/data/a41/frontier-ir-venv/bin/python")


def image_reward_scores(items: list[dict]) -> dict[str, float]:
    """ImageReward runs in its own venv (transformers 4.x); see image_reward_worker.py."""
    worker = pathlib.Path(__file__).with_name("image_reward_worker.py")
    with tempfile.NamedTemporaryFile("r", suffix=".json") as result:
        proc = subprocess.run([IMAGE_REWARD_PYTHON, str(worker), result.name], input=json.dumps(items),
                              capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"image_reward_worker failed:\n{proc.stdout[-1000:]}\n{proc.stderr[-2000:]}")
        return json.load(result)


def score(reference: pathlib.Path | None, candidate: pathlib.Path, image_reward: bool = True) -> dict:
    import torch
    from skimage.metrics import structural_similarity

    cand = load_rows(candidate)
    ref = load_rows(reference) if reference else None
    if ref is not None and set(ref) != set(cand):
        raise ValueError(f"pair sets differ: {sorted(set(ref) ^ set(cand))}")
    net = None
    if ref is not None:
        import lpips
        net = lpips.LPIPS(net="alex", verbose=False).eval()
    rewards = image_reward_scores(
        [dict(pair_id=pid, prompt=row["prompt"], png=str(candidate / row["png"])) for pid, row in sorted(cand.items())]
    ) if image_reward else {}

    per_pair = []
    for pid, row in sorted(cand.items()):
        rec = dict(pair_id=pid, category=row.get("category"), seed=row["seed"])
        c_rgb, c_alpha = composite(candidate / row["png"])
        if ref is not None:
            r_rgb, r_alpha = composite(reference / ref[pid]["png"])
            if c_rgb.shape != r_rgb.shape:
                raise ValueError(f"{pid}: shape {c_rgb.shape} vs reference {r_rgb.shape}")
            with torch.no_grad():
                t = lambda x: torch.from_numpy(x).permute(2, 0, 1).unsqueeze(0).float() / 255.0
                rec["lpips"] = float(net(t(c_rgb), t(r_rgb), normalize=True).flatten()[0])
            rec["psnr"] = psnr(c_rgb, r_rgb)
            rec["ssim"] = float(structural_similarity(c_rgb, r_rgb, data_range=255, channel_axis=-1))
            rec["pixels_identical"] = bool(np.array_equal(c_rgb, r_rgb))
            rec["alpha_max_abs"] = int(np.abs(c_alpha.astype(np.int16) - r_alpha.astype(np.int16)).max())
        if pid in rewards:
            rec["image_reward"] = rewards[pid]
        per_pair.append(rec)
    return dict(candidate=str(candidate), reference=str(reference) if reference else None,
                summary=summarize(per_pair), pairs=per_pair)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--reference", type=pathlib.Path, default=None,
                    help="the baseline run directory; omit when scoring the baseline itself")
    ap.add_argument("--candidate", type=pathlib.Path, required=True)
    ap.add_argument("--no-image-reward", action="store_true")
    ap.add_argument("--out", type=pathlib.Path, default=None, help="default <candidate>/scores.json")
    args = ap.parse_args()
    result = score(args.reference, args.candidate, image_reward=not args.no_image_reward)
    out = args.out or args.candidate / "scores.json"
    out.write_text(json.dumps(result, indent=2))
    print(json.dumps(result["summary"], indent=2))
    print("SCORE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
