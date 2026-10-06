"""Teacher forcing for a speech recipe's thinker: a vLLM logits processor.

A request whose sampling params carry `extra_args.force_token_ids` decodes
exactly those tokens, one per step, whatever the model would pick; at each
step the processor first records whether the model's own greedy choice (the
argmax of the logits it was handed) is the forced token. When the last forced
token is chosen, it appends one line to `extra_args.force_log`:
`{"tag", "agree": [0/1 per step]}`.

Forcing the baseline's reply through a recipe compares the two step by step on
identical inputs: the recipe's text never branches off, so the agreement rate
measures how far the recipe's numerics moved the model, the way LPIPS does for
an image. The decode steps run on the recipe's own kernels: the fork's thinker
megakernel returns a hidden state that vLLM's LM head and sampler, and so this
processor, still turn into the token.

Loaded into a stage by its deploy config (`logits_processors:
["bench.forced_decode:ForcedDecode"]`), with the repo root on PYTHONPATH.
Requests without `force_token_ids` pass through untouched.
"""

from __future__ import annotations

import json

import torch
from vllm.v1.sample.logits_processor.interface import BatchUpdate, LogitsProcessor, MoveDirectionality


class ForcedDecode(LogitsProcessor):
    def __init__(self, vllm_config, device: torch.device, is_pin_memory: bool) -> None:
        self.rows: dict[int, dict] = {}

    def is_argmax_invariant(self) -> bool:
        return False

    def update_state(self, batch_update: BatchUpdate | None) -> None:
        if batch_update is None:
            return
        for index in batch_update.removed:
            self.rows.pop(index, None)
        for index, params, _, output_ids in batch_update.added:
            extra = (params.extra_args or {}) if params is not None else {}
            if extra.get("force_token_ids"):
                self.rows[index] = dict(force=list(extra["force_token_ids"]), out=output_ids,
                                        log=extra["force_log"], tag=extra.get("force_tag"), agree=[])
            else:
                self.rows.pop(index, None)
        for a, b, direction in batch_update.moved:
            row_a, row_b = self.rows.pop(a, None), self.rows.pop(b, None)
            if row_a is not None:
                self.rows[b] = row_a
            if direction == MoveDirectionality.SWAP and row_b is not None:
                self.rows[a] = row_b

    def apply(self, logits: torch.Tensor) -> torch.Tensor:
        for index, row in self.rows.items():
            step = len(row["out"])
            if step >= len(row["force"]) or len(row["agree"]) > step:
                continue
            token = row["force"][step]
            row["agree"].append(int(int(logits[index].argmax()) == token))
            logits[index] = float("-inf")
            logits[index, token] = 0.0
            if step == len(row["force"]) - 1:
                with open(row["log"], "a") as fh:
                    fh.write(json.dumps(dict(tag=row["tag"], agree=row["agree"])) + "\n")
        return logits
