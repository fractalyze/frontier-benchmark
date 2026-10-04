"""What a speech recipe runs, and how its replies are scored. Pure: no GPU, no server.

A speech page serves one checkpoint through vLLM-Omni. The baseline recipe
(`configPath: null`) runs the model's stock deploy config on the stock engine;
any other recipe's `configPath` is a `vllm-omni-runtime` file:

    {"schema": "vllm-omni-runtime",
     "deploy": "<repo-relative deploy yaml>",
     "mps": true,
     "env": {"VLLM_OMNI_...": "1"}}

The engine is the recipe's `engine.version`: a vLLM-Omni checkout at
`$BENCH_VLLM_OMNI/<version>` with its venv at `$BENCH_VLLM_OMNI/venv-<version>`.

Quality is two numbers per recipe:

- text WER vs the baseline (the frontier's loss, like LPIPS for an image): the
  recipe's reply text against the baseline's reply text for the same prompt and
  seed. The thinker decodes greedily, so 0 means the recipe said the same words.
- ASR WER (shown, never the frontier): each reply's audio transcribed and
  scored against that reply's own text, baseline included. The talker samples,
  so audio is never compared across recipes.
"""

from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path

from bench import protocol

VLLM_OMNI_ROOT = Path(os.environ.get("BENCH_VLLM_OMNI", "/data/a41/omni"))


@dataclasses.dataclass(frozen=True)
class SpeechModel:
    repo: str
    revision: str
    baseline_deploy: str  # repo-relative deploy config of the baseline recipe


# Keyed by benchmark.json `model`.
MODELS = {
    "qwen3-omni": SpeechModel(
        "cyankiwi/Qwen3-Omni-30B-A3B-Instruct-AWQ-4bit",
        "d6e1eff8d3414580a276744361d5b6d7d4798a56",
        "data/benchmarks/qwen3-omni/rtx5090/configs/production.yaml",
    ),
}
ASR_MODEL = SpeechModel("Qwen/Qwen3-ASR-1.7B", "7278e1e70fe206f11671096ffdd38061171dd6e5", "")
# Not in any prompt set: they only bring the server to steady state.
WARMUP_PROMPTS = (
    "Say hello in one short sentence.",
    "Name three colours of the rainbow in one sentence.",
    "Say good morning to a friend in two short sentences.",
)


@dataclasses.dataclass(frozen=True)
class SpeechSpec:
    recipe_id: str
    model: SpeechModel
    engine_version: str
    deploy: str  # repo-relative
    mps: bool
    env: dict

    @property
    def checkout(self) -> Path:
        return VLLM_OMNI_ROOT / self.engine_version

    @property
    def venv(self) -> Path:
        return VLLM_OMNI_ROOT / f"venv-{self.engine_version}"


def model_for(benchmark: dict) -> SpeechModel:
    try:
        return MODELS[benchmark["model"]]
    except KeyError:
        raise ValueError(f"no speech checkpoint registered for model {benchmark['model']!r}") from None


def run_spec(benchmark: dict, recipe: dict, config: dict | None) -> SpeechSpec:
    model = model_for(benchmark)
    version = recipe["engine"]["version"]
    if config is None:
        return SpeechSpec(recipe["id"], model, version, model.baseline_deploy, False, {})
    if config.get("schema") != "vllm-omni-runtime":
        raise ValueError(f"unrecognised config for speech recipe {recipe['id']}: {config.get('schema')!r}")
    return SpeechSpec(recipe["id"], model, version, config["deploy"], bool(config.get("mps", False)),
                      {k: str(v) for k, v in config.get("env", {}).items()})


def spec_for(model: str, hardware: str, recipe_id: str) -> SpeechSpec:
    benchmark = protocol.load_benchmark(model, hardware)
    recipe = protocol.load_recipe(model, hardware, recipe_id)
    path = recipe["configPath"]
    config = json.loads((protocol.REPO / path).read_text()) if path else None
    return run_spec(benchmark, recipe, config)


def load_prompts(path: str | Path, split: str = "heldout") -> list[dict]:
    """`{pair_id, prompt, seed}` from either corpus shape: the held-out file's
    `splits.<split>[]` or the public file's `prompts[]` of single user messages."""
    corpus = json.loads(Path(path).read_text())
    if "splits" in corpus:
        pairs = [dict(pair_id=p["pair_id"], prompt=p["prompt"], seed=int(p["seed"]))
                 for p in corpus["splits"][split]]
    else:
        pairs = []
        for p in corpus["prompts"]:
            (msg,) = p["messages"]
            if msg["role"] != "user":
                raise ValueError(f"{p['pair_id']}: expected one user message")
            pairs.append(dict(pair_id=p["pair_id"], prompt=msg["content"], seed=int(p["seed"])))
    ids = [p["pair_id"] for p in pairs]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate pair_id in {path}")
    return pairs


def word_errors(ref: str, hyp: str) -> tuple[int, int]:
    """(substitutions + deletions + insertions, words in ref) of two normalized texts."""
    import jiwer

    if not ref.split():
        return len(hyp.split()), 0
    out = jiwer.process_words(ref, hyp)
    return out.substitutions + out.deletions + out.insertions, len(ref.split())


def wer_summary(per_pair: dict[str, list[tuple[int, int]]]) -> dict:
    """`mean`: word-weighted WER over every scored text; `max`: the worst pair's own WER.

    `per_pair` maps a pair id to its (errors, words) for each text scored under it
    (one per pair for text vs baseline, one per reply for ASR)."""
    if not per_pair:
        raise ValueError("nothing to score")
    errors = sum(e for rows in per_pair.values() for e, _ in rows)
    words = sum(w for rows in per_pair.values() for _, w in rows)
    if words == 0:
        raise ValueError("reference texts have no words")
    worst = max(sum(e for e, _ in rows) / max(1, sum(w for _, w in rows)) for rows in per_pair.values())
    return dict(mean=round(errors / words, 4), max=round(worst, 4))

