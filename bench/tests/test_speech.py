import json

import pytest

from bench import emit, env, score_speech, speech

BENCH = {"model": "qwen3-omni", "workload": "speech", "baselineRecipe": "vllm-omni-native",
         "promptSets": {"public": {}, "held-out": None}}


def recipe(rid, version="379804a6", config_path=None):
    return {"id": rid, "engine": {"version": version}, "configPath": config_path, "metrics": {},
            "status": "Submitted", "measuredOn": "public", "date": "2026-10-02", "sourceUrl": "https://x"}


def test_baseline_serves_the_stock_deploy_on_its_own_engine_without_mps():
    spec = speech.run_spec(BENCH, recipe("vllm-omni-native", "69de153f"), None)
    assert spec.deploy.endswith("configs/production.yaml")
    assert spec.mps is False and spec.env == {}
    assert spec.checkout.name == "69de153f" and spec.venv.name == "venv-69de153f"
    assert spec.model.revision.startswith("d6e1eff8")


def test_runtime_config_sets_deploy_mps_and_switches():
    config = {"schema": "vllm-omni-runtime", "deploy": "x/kernels.yaml", "mps": True,
              "env": {"VLLM_OMNI_THINKER_MEGAKERNEL_CTAS": 64}}
    spec = speech.run_spec(BENCH, recipe("kernels"), config)
    assert spec.deploy == "x/kernels.yaml" and spec.mps is True
    assert spec.env == {"VLLM_OMNI_THINKER_MEGAKERNEL_CTAS": "64"}


def test_unknown_config_or_model_is_refused():
    with pytest.raises(ValueError, match="unrecognised config"):
        speech.run_spec(BENCH, recipe("k"), {"schema": "sglang-runtime"})
    with pytest.raises(ValueError, match="no speech checkpoint"):
        speech.run_spec({**BENCH, "model": "qwen-image-2.1"}, recipe("k"), None)


@pytest.mark.parametrize("rid", ["kernels", "deterministic-marlin"])
def test_the_page_recipes_resolve_with_every_switch(rid):
    spec = speech.spec_for("qwen3-omni", "rtx5090", rid)
    assert spec.mps and spec.engine_version == "379804a6"
    assert len(spec.env) == {"kernels": 18, "deterministic-marlin": 6}[rid]
    assert spec.env["VLLM_OMNI_DETERMINISTIC_MARLIN"] == "1"


def test_loads_both_corpus_shapes(tmp_path):
    public = speech.load_prompts("data/prompts/qwen3-omni-speech-v1.json")
    assert [p["pair_id"] for p in public] == ["speech-v1:0", "speech-v1:1", "speech-v1:2"]
    assert public[0]["prompt"].startswith("Tell me a short story") and public[0]["seed"] == 42
    heldout = tmp_path / "h.json"
    heldout.write_text(json.dumps({"splits": {"heldout": [{"pair_id": "a", "prompt": "p", "seed": 7},
                                                          {"pair_id": "a", "prompt": "q", "seed": 7}]}}))
    with pytest.raises(ValueError, match="duplicate pair_id"):
        speech.load_prompts(heldout)


def test_word_errors_counts_substitutions_deletions_and_insertions():
    assert speech.word_errors("a b c d", "a b c d") == (0, 4)
    assert speech.word_errors("a b c d", "a x c") == (2, 4)  # one substitution, one deletion
    assert speech.word_errors("a b", "a b c") == (1, 2)


def test_wer_summary_is_word_weighted_and_reports_the_worst_pair():
    s = speech.wer_summary({"p0": [(1, 10)], "p1": [(0, 30)], "p2": [(3, 10), (1, 10)]})
    assert s == {"mean": round(5 / 60, 4), "max": 0.2}


def run_dir(tmp_path, name, texts, repeats=1):
    d = tmp_path / name
    d.mkdir()
    rows = []
    for i, (pid, text) in enumerate(texts.items()):
        for k in range(repeats):
            (d / f"{i}_r{k}.txt").write_text(text)
            rows.append({"pair_id": pid, "index": i, "repeat": k})
    (d / "rows.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    return d


def test_asr_wer_scores_every_reply_against_its_own_text(tmp_path):
    run = run_dir(tmp_path, "r", {"p0": "hello there friend"}, repeats=2)
    transcripts = {"0_r0": "hello there friend", "0_r1": "hello the friend"}
    summary, _ = score_speech.asr_wer(run, transcripts, str)
    assert summary == {"mean": round(1 / 6, 4), "max": round(1 / 6, 4)}


SPEECH_MANIFEST = {"workload": "speech", "ttfa": {"p50": 0.024849}, "pairs": 20, "dirty": False,
                   "engine_commit": "379804a68ea8aa77f703992d00961e884ebbe5f7"}


def test_emit_writes_ttfa_token_disagreement_and_asr_wer_and_verifies_held_out():
    scores = {"summary": {"asrWer": {"mean": 0.011, "max": 0.04}}}
    agree = {"summary": {"mean": 0.0188, "max": 0.0536}}
    r, b = emit.apply(recipe("kernels"), BENCH, SPEECH_MANIFEST, scores, prompt_set="speech-heldout-v1",
                      measured_on="held-out", date="2026-10-05", engine_version="379804a6", agree=agree)
    assert r["metrics"] == {"latencyS": 0.0248, "peakVramGb": None, "lpips": None,
                            "disagree": {"mean": 0.0188, "max": 0.0536}, "asrWer": {"mean": 0.011, "max": 0.04},
                            "psnr": None, "ssim": None, "imageReward": None}
    assert r["status"] == "Verified" and b["promptSets"]["held-out"] == {"name": "speech-heldout-v1", "count": 20}


def test_emit_keeps_the_baselines_disagreement_null_but_its_asr_wer():
    scores = {"summary": {"asrWer": {"mean": 0.016, "max": 0.05}}}
    r, _ = emit.apply(recipe("vllm-omni-native", "69de153f"), BENCH, SPEECH_MANIFEST, scores,
                      prompt_set="speech-heldout-v1", measured_on="held-out", date="2026-10-05",
                      engine_version=None)
    assert r["metrics"]["disagree"] is None and r["metrics"]["asrWer"] == {"mean": 0.016, "max": 0.05}


def test_emit_refuses_a_speech_recipe_without_its_agreement():
    with pytest.raises(ValueError, match="agree.json"):
        emit.apply(recipe("kernels"), BENCH, SPEECH_MANIFEST, {"summary": {"asrWer": None}},
                   prompt_set="s", measured_on="held-out", date="2026-10-05", engine_version=None)


def test_an_mps_server_counted_as_ours_is_not_foreign(monkeypatch):
    monkeypatch.setattr(env, "_ancestors", lambda pid: {pid})
    assert not env._is_ours(4242)
    assert env._is_ours(4242, frozenset({4242}))
