"""Prompt sets. Both the vendored public corpus and the private held-out file
use the DPCache study's corpus shape: `splits.<name>` is a list of
`{pair_id, prompt, seed, category}`."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def load_pairs(path: str | Path, split: str = "heldout") -> list[dict]:
    corpus = json.loads(Path(path).read_text())
    pairs = corpus["splits"][split]
    ids = [p["pair_id"] for p in pairs]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate pair_id in {path}:{split}")
    return [dict(pair_id=p["pair_id"], prompt=p["prompt"], seed=int(p["seed"]),
                 category=p.get("category", "")) for p in pairs]


def corpus_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pair_id(prefix: str, prompt: str, seed: int) -> str:
    return f"{prefix}:{hashlib.sha256(prompt.encode()).hexdigest()[:12]}:{seed}"
