"""Force the baseline's replies through a speech recipe's thinker and count how
often the recipe's own next token agrees: the speech page's quality loss.

    python -m bench.agree --model qwen3-omni --recipe kernels \
        --reference <runs>/vllm-omni-native --out <runs>/kernels

For each prompt, the baseline's first reply (`<reference>/<i>_r0.txt`) is
tokenized with the checkpoint's tokenizer, end-of-turn token included, and
sent as a text-only request whose thinker decodes exactly those tokens
(bench/forced_decode.py). Every step is a comparison on identical inputs, so
unlike free decoding, where one flipped token sends the rest of the reply down
another path, the count measures only how far the recipe's numerics moved.

Writes `<out>/agree.json`: per prompt and overall, the steps whose greedy
choice differed from the baseline's token. Forcing the baseline through itself
must give zero; a nonzero count there means the tokenization does not round-trip.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import env, protocol, speak, speech  # noqa: E402

PROCESSOR = "bench.forced_decode:ForcedDecode"  # vLLM loads "module:Class"


def forcing_deploy(deploy: pathlib.Path, out: pathlib.Path) -> pathlib.Path:
    """The recipe's deploy config with the forcing processor on its thinker (stage 0)."""
    import yaml

    config = yaml.safe_load(deploy.read_text())
    (stage,) = [s for s in config["stages"] if s["stage_id"] == 0]
    stage["logits_processors"] = [PROCESSOR]
    path = out / f"forcing-{deploy.name}"
    path.write_text(yaml.safe_dump(config, sort_keys=False))
    return path


def disagreement(per_pair: dict[str, list[int]]) -> dict:
    """`mean`: share of all forced steps whose greedy choice differed; `max`: the worst prompt's share."""
    steps = sum(len(a) for a in per_pair.values())
    if steps == 0:
        raise ValueError("no forced steps")
    misses = sum(len(a) - sum(a) for a in per_pair.values())
    worst = max((len(a) - sum(a)) / len(a) for a in per_pair.values() if a)
    return dict(mean=round(misses / steps, 4), max=round(worst, 4))


def main() -> int:
    import requests
    from transformers import AutoTokenizer

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", required=True)
    ap.add_argument("--hardware", default="rtx5090")
    ap.add_argument("--recipe", required=True)
    ap.add_argument("--reference", type=pathlib.Path, required=True, help="the baseline's speak run")
    ap.add_argument("--out", type=pathlib.Path, required=True)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--port", type=int, default=8091)
    args = ap.parse_args()

    spec = speech.spec_for(args.model, args.hardware, args.recipe)
    tokenizer = AutoTokenizer.from_pretrained(
        pathlib.Path(protocol.HF_HOME) / "hub" / ("models--" + spec.model.repo.replace("/", "--"))
        / "snapshots" / spec.model.revision)
    end = tokenizer.convert_tokens_to_ids("<|im_end|>")
    rows = [r for r in speech.read_rows(args.reference) if r["repeat"] == 0][: args.limit]
    args.out.mkdir(parents=True, exist_ok=True)
    log = args.out / "forced.jsonl"
    log.unlink(missing_ok=True)
    forcing = dataclasses.replace(spec, deploy=str(forcing_deploy(protocol.REPO / spec.deploy, args.out)),
                                  env={**spec.env, "PYTHONPATH": str(protocol.REPO)})
    manifest = speech.read_manifest(args.reference)
    prompts = {p["pair_id"]: p for p in speech.load_prompts(manifest["prompts"], manifest["split"])}
    env.wait_for_quiet()
    with speak.serving(forcing, args.port, args.out / "agree-server.log"):
        for row in rows:
            text = (args.reference / f"{row['index']}_r0.txt").read_text()
            force = tokenizer(text, add_special_tokens=False)["input_ids"] + [end]
            pair = prompts[row["pair_id"]]
            body = {"model": spec.model.repo, "messages": [{"role": "user", "content": pair["prompt"]}],
                    "modalities": ["text"], "stream": False,
                    "sampling_params_list": [dict(temperature=0.0, max_tokens=len(force), seed=pair["seed"],
                                                  extra_args=dict(force_token_ids=force, force_log=str(log),
                                                                  force_tag=row["pair_id"]))]}
            r = requests.post(f"http://127.0.0.1:{args.port}/v1/chat/completions", json=body, timeout=600)
            r.raise_for_status()
            print(f"{row['index']}: forced {len(force)} tokens", flush=True)
    per_pair = {d["tag"]: d["agree"] for d in map(json.loads, log.read_text().splitlines())}
    missing = {r["pair_id"] for r in rows} - per_pair.keys()
    if missing:
        raise RuntimeError(f"no forced-decode record for {sorted(missing)}; see {args.out}/agree-server.log")
    out = dict(recipe=args.recipe, reference=str(args.reference), summary=disagreement(per_pair),
               per_pair={pid: dict(steps=len(a), disagree=len(a) - sum(a)) for pid, a in per_pair.items()})
    (args.out / "agree.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out["summary"]))
    print("AGREE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
