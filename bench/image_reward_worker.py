"""ImageReward-v1.0 scores for (prompt, png) pairs, run in its own venv.

ImageReward pins transformers 4.x while the engine needs 5.x, so score.py
runs this file with `IMAGE_REWARD_PYTHON` (a venv with transformers 4.x; the default in score.py is the reference machine's).
stdin: JSON list of {"pair_id", "prompt", "png"}; argv[1]: output JSON file
{pair_id: score}. ImageReward logs to stdout, so the result goes to a file.
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    import ImageReward
    import torch

    items = json.load(sys.stdin)
    model = ImageReward.load("ImageReward-v1.0", device="cuda" if torch.cuda.is_available() else "cpu")
    out = {}
    with torch.no_grad():
        for item in items:
            out[item["pair_id"]] = float(model.score(item["prompt"], item["png"]))
    with open(sys.argv[1], "w") as fh:
        json.dump(out, fh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
