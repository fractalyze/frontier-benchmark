import json

import pytest

from bench import calibrate, protocol


def test_server_kwargs_become_tool_flags():
    flags = calibrate.server_flags({
        "model_path": "/m", "model_id": "Qwen-Image-2.1", "attention_backend": "sage_attn",
        "enable_attention_backend_autotune": False,
        "enable_torch_compile": False, "component_quantizations": {"transformer": "fp8"},
        "component_quantization_ignored_layers": {"transformer": ["proj_out", "norm_out"]},
        "component_residency": ["dit=resident", "vae=resident"], "batching_max_size": 1,
    })
    assert flags == ["--model-path", "/m", "--attention-backend", "sage_attn",
                     "--enable-torch-compile", "false", "--component-quantizations.transformer=fp8",
                     "--component-quantization-ignored-layers.transformer", "proj_out", "norm_out",
                     "--component-residency", "dit=resident", "vae=resident"]


def test_autotune_has_no_tool_flag():
    with pytest.raises(ValueError, match="autotune"):
        calibrate.server_flags({"enable_attention_backend_autotune": True})


def test_runtime_spec_ignores_the_schedule_it_is_about_to_create(monkeypatch):
    """The recipe config points at a schedule file that does not exist yet."""
    benchmark = protocol.load_benchmark("qwen-image-2.1", "rtx5090")
    recipe = {"id": "r", "configPath": "cfg.json"}
    cfg = {"schema": "sglang-runtime", "server": {"attention_backend": "sage_attn"},
           "dpcache_schedule": "configs/dpcache-r/K12.json"}
    monkeypatch.setattr(protocol, "load_benchmark", lambda m, h: benchmark)
    monkeypatch.setattr(protocol, "load_recipe", lambda m, h, r: recipe)
    monkeypatch.setattr(protocol.Path, "read_text", lambda self: json.dumps(cfg))
    spec = calibrate.runtime_spec("qwen-image-2.1", "rtx5090", "r")
    assert spec.server["attention_backend"] == "sage_attn"
    assert "dpcache_budget" not in spec.request and spec.schedule is None


def test_runtime_spec_refuses_non_runtime_configs(monkeypatch):
    benchmark = protocol.load_benchmark("qwen-image-2.1", "rtx5090")
    monkeypatch.setattr(protocol, "load_benchmark", lambda m, h: benchmark)
    monkeypatch.setattr(protocol, "load_recipe", lambda m, h, r: {"id": "r", "configPath": None})
    with pytest.raises(ValueError, match="no config"):
        calibrate.runtime_spec("qwen-image-2.1", "rtx5090", "r")
