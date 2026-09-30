import pytest

from bench import emit

MANIFEST = {"wall": {"p50": 6.8471}, "peak_memory_mb": 20480, "pairs": 20, "dirty": False}
SCORES_REF = {"reference": "/runs/sglang-native", "summary": {
    "lpips": {"mean": 0.0076, "max": 0.035}, "psnr": {"mean": 41.5, "min": 28.2},
    "ssim": {"mean": 0.99}, "imageReward": {"mean": 1.1}}}
BENCH = {"baselineRecipe": "sglang-native", "promptSets": {"public": {}, "held-out": None}}


def recipe(rid):
    return {"id": rid, "engine": {"version": "old"}, "metrics": {}, "status": "Submitted",
            "measuredOn": "public", "date": "2026-09-23", "sourceUrl": "https://x"}


def test_heldout_run_verifies_and_records_the_prompt_set():
    r, b = emit.apply(recipe("dpcache-k20"), BENCH, MANIFEST, SCORES_REF,
                      prompt_set="heldout-v1", measured_on="held-out", date="2026-09-30", engine_version="abc")
    assert r["status"] == "Verified" and r["measuredOn"] == "held-out" and r["sourceUrl"] is None
    assert r["metrics"] == {"latencyS": 6.847, "peakVramGb": 20.0, "lpips": {"mean": 0.0076, "max": 0.035},
                            "psnr": {"mean": 41.5, "min": 28.2}, "ssim": {"mean": 0.99}, "imageReward": {"mean": 1.1}}
    assert r["engine"]["version"] == "abc"
    assert b["promptSets"]["held-out"] == {"name": "heldout-v1", "count": 20}
    assert BENCH["promptSets"]["held-out"] is None  # input untouched


def test_baseline_keeps_vs_baseline_metrics_null():
    scores = {"reference": None, "summary": {"imageReward": {"mean": 0.9}}}
    r, _ = emit.apply(recipe("sglang-native"), BENCH, MANIFEST, scores,
                      prompt_set="heldout-v1", measured_on="held-out", date="2026-09-30", engine_version=None)
    assert r["metrics"]["lpips"] is None and r["metrics"]["psnr"] is None and r["metrics"]["ssim"] is None
    assert r["metrics"]["imageReward"] == {"mean": 0.9} and r["engine"]["version"] == "old"


def test_public_run_stays_submitted():
    r, b = emit.apply(recipe("dpcache-k20"), BENCH, MANIFEST, SCORES_REF,
                      prompt_set="comparator-v1", measured_on="public", date="2026-09-30", engine_version=None)
    assert r["status"] == "Submitted" and b["promptSets"]["held-out"] is None


def test_dirty_run_is_refused():
    with pytest.raises(ValueError, match="DIRTY"):
        emit.apply(recipe("dpcache-k20"), BENCH, {**MANIFEST, "dirty": True}, SCORES_REF,
                   prompt_set="x", measured_on="held-out", date="2026-09-30", engine_version=None)


def test_non_baseline_needs_a_reference():
    with pytest.raises(ValueError, match="reference"):
        emit.apply(recipe("dpcache-k20"), BENCH, MANIFEST, {"reference": None, "summary": {}},
                   prompt_set="x", measured_on="held-out", date="2026-09-30", engine_version=None)
