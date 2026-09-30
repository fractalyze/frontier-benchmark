import json

import pytest

from bench import protocol

BENCH = {
    "protocol": {"version": "v0.4", "resolution": "1024x1024", "batch": 1, "steps": 40,
                 "precision": "BF16", "guidance": 1.0, "attention": "torch_sdpa", "offload": "text encoder layerwise"},
    "baselineRecipe": "sglang-native",
}
RECIPE = {"id": "r", "configPath": None}


def test_baseline_runs_the_protocol_unchanged():
    spec = protocol.run_spec(BENCH, RECIPE, None)
    assert spec.server["component_residency"] == ["dit=resident", "text_encoder=layerwise-offload", "vae=resident"]
    assert "dit_layerwise_offload" not in spec.server
    assert spec.server["attention_backend"] == "torch_sdpa"
    assert spec.server["enable_torch_compile"] is False
    assert spec.request["num_inference_steps"] == 40
    assert spec.request["width"] == spec.request["height"] == 1024
    assert spec.request["guidance_scale"] == 1.0
    assert spec.request["generator_device"] == "cpu"
    assert spec.env == {} and spec.schedule is None


def test_dit_layerwise_protocol_streams_the_dit():
    bench = {**BENCH, "protocol": {**BENCH["protocol"], "offload": "DiT layerwise"}}
    assert protocol.run_spec(bench, RECIPE, None).server["dit_layerwise_offload"] is True


def test_unknown_offload_is_refused():
    bench = {**BENCH, "protocol": {**BENCH["protocol"], "offload": "everything resident"}}
    with pytest.raises(ValueError, match="offload"):
        protocol.run_spec(bench, RECIPE, None)


def test_dpcache_schedule_becomes_budget_request():
    sched = {"full_steps": [0, 1, 2], "num_full_steps": 20,
             "request": {"num_inference_steps": 40, "height": 1024, "guidance_scale": 1.0,
                         "attention_backend": "torch_sdpa", "checkpoint": protocol.MODEL_REVISION}}
    spec = protocol.run_spec(BENCH, RECIPE, sched)
    assert spec.request["dpcache_budget"] == 20
    assert spec.schedule is sched


def test_dpcache_schedule_for_another_protocol_is_refused():
    sched = {"full_steps": [0], "num_full_steps": 12, "request": {"num_inference_steps": 50}}
    with pytest.raises(ValueError, match="num_inference_steps"):
        protocol.run_spec(BENCH, RECIPE, sched)


def test_cache_dit_params_go_on_the_request():
    cfg = {"schema": "sglang-cache-dit-params", "cache_dit_params": {"residual_diff_threshold": 0.24}}
    spec = protocol.run_spec(BENCH, RECIPE, cfg)
    assert spec.request["enable_cache_dit"] is True
    assert spec.request["cache_dit_params"] == {"residual_diff_threshold": 0.24}


def test_runtime_config_overrides_server_env_and_drops_offload_when_resident():
    cfg = {"schema": "sglang-runtime",
           "server": {"component_quantizations": {"transformer": "fp8"}, "attention_backend": "sage_attn",
                      "component_residency": ["dit=resident"]},
           "env": {"SGLANG_ENABLE_QWEN3VL_TEXT_CUDA_GRAPH": 1}}
    spec = protocol.run_spec(BENCH, RECIPE, cfg)
    assert spec.server["component_quantizations"] == {"transformer": "fp8"}
    assert spec.server["attention_backend"] == "sage_attn"
    assert "dit_layerwise_offload" not in spec.server
    assert spec.env == {"SGLANG_ENABLE_QWEN3VL_TEXT_CUDA_GRAPH": "1"}


def test_runtime_config_can_stack_a_dpcache_schedule(tmp_path, monkeypatch):
    sched = {"full_steps": [0, 1, 2], "num_full_steps": 12,
             "request": {"attention_backend": "sage_attn", "checkpoint": protocol.MODEL_REVISION}}
    (tmp_path / "K12.json").write_text(json.dumps(sched))
    monkeypatch.setattr(protocol, "REPO", tmp_path)
    cfg = {"schema": "sglang-runtime", "server": {"attention_backend": "sage_attn"},
           "dpcache_schedule": "K12.json"}
    spec = protocol.run_spec(BENCH, RECIPE, cfg)
    assert spec.request["dpcache_budget"] == 12 and spec.schedule == sched
    cfg["server"]["attention_backend"] = "torch_sdpa"
    with pytest.raises(ValueError, match="attention_backend"):
        protocol.run_spec(BENCH, RECIPE, cfg)


def test_unknown_config_is_refused():
    with pytest.raises(ValueError, match="unrecognised"):
        protocol.run_spec(BENCH, RECIPE, {"schema": "something-else"})


def test_every_repo_recipe_resolves():
    bdir = protocol.benchmark_dir("qwen-image-2.1", "rtx5090")
    for path in sorted((bdir / "recipes").glob("*.json")):
        spec = protocol.spec_for("qwen-image-2.1", "rtx5090", json.loads(path.read_text())["id"])
        assert spec.request["num_inference_steps"] == 40
