import json
import types

import pytest

from bench import agree


def test_disagreement_is_step_weighted_with_the_worst_prompt():
    assert agree.disagreement({"p0": [1, 1, 1, 0], "p1": [1] * 6}) == {"mean": 0.1, "max": 0.25}
    with pytest.raises(ValueError, match="no forced steps"):
        agree.disagreement({"p0": []})


def test_forcing_deploy_adds_the_processor_to_the_thinker_only(tmp_path):
    deploy = tmp_path / "d.yaml"
    deploy.write_text("stages:\n  - stage_id: 0\n    moe_backend: triton\n  - stage_id: 1\n")
    import yaml

    stages = yaml.safe_load(agree.forcing_deploy(deploy, tmp_path).read_text())["stages"]
    assert stages[0] == {"stage_id": 0, "moe_backend": "triton", "logits_processors": [agree.PROCESSOR]}
    assert "logits_processors" not in stages[1]


def test_forced_decode_emits_the_given_tokens_and_logs_each_steps_agreement(tmp_path):
    torch = pytest.importorskip("torch")
    pytest.importorskip("vllm")
    from vllm.v1.sample.logits_processor.interface import BatchUpdate

    from bench.forced_decode import ForcedDecode

    log = tmp_path / "forced.jsonl"
    proc = ForcedDecode(None, torch.device("cpu"), False)
    out: list[int] = []
    params = types.SimpleNamespace(extra_args={"force_token_ids": [2, 0], "force_log": str(log), "force_tag": "p0"})
    passthrough = types.SimpleNamespace(extra_args=None)
    proc.update_state(BatchUpdate(batch_size=2, removed=[], added=[(0, params, [], out), (1, passthrough, [], [])],
                                  moved=[]))
    # The model prefers token 1 but token 2 is forced; the unforced row is left alone.
    logits = proc.apply(torch.tensor([[0.0, 5.0, 1.0], [3.0, 0.0, 0.0]]))
    assert int(logits[0].argmax()) == 2 and torch.equal(logits[1], torch.tensor([3.0, 0.0, 0.0]))
    out.append(2)
    # The model's own choice matches the last forced token, which closes and logs the reply.
    proc.apply(torch.tensor([[4.0, 0.0, 1.0], [0.0, 0.0, 0.0]]))
    assert json.loads(log.read_text()) == {"tag": "p0", "agree": [0, 1]}
