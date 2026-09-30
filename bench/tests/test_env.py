import pytest

from bench import env


def stamps(seq):
    it = iter(seq)
    return lambda: {"foreign_procs": next(it)}


def test_wait_for_quiet_returns_once_the_gpu_has_been_free_long_enough(monkeypatch):
    monkeypatch.setattr(env, "gpu_stamp", stamps([["baz"], [], [], []]))
    stamp = env.wait_for_quiet(quiet_s=0.0, budget_s=5.0, poll_s=0.0)
    assert stamp["foreign_procs"] == []


def test_wait_for_quiet_gives_up_after_the_budget(monkeypatch):
    monkeypatch.setattr(env, "gpu_stamp", stamps([["baz"]] * 100))
    with pytest.raises(RuntimeError, match="did not go quiet"):
        env.wait_for_quiet(quiet_s=1.0, budget_s=0.05, poll_s=0.01)


def test_is_dirty_sees_any_foreign_process():
    assert env.is_dirty({"foreign_procs": []}, {"foreign_procs": ["x"]})
    assert not env.is_dirty({"foreign_procs": []}, {"foreign_procs": []})
