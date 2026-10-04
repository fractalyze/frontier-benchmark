"""Score a speech run: text WER vs the baseline's replies, and ASR WER of its audio.

    python -m bench.score_speech --candidate <runs>/kernels --reference <runs>/vllm-omni-native

`wer` (the frontier's loss): each prompt's reply text against the baseline
reply for the same prompt and seed, word-weighted over the prompts; `max` is
the worst prompt. Omitted for the baseline itself (`--reference` not given).

`asrWer` (shown only): every reply's audio transcribed by Qwen3-ASR-1.7B and
scored against that reply's own text. Transcripts are cached in
`<run>/asr.jsonl`; without `--asr-url` an ASR server is started from the venv
`--asr-venv` for the duration.

Texts are normalized with openai-whisper's EnglishTextNormalizer, as in the
showcase's own WER. Writes `<run>/scores.json`.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import pathlib
import signal
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import speech  # noqa: E402

ASR_PORT = 8000


def rows(run: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in (run / "rows.jsonl").read_text().splitlines() if line.strip()]


def first_texts(run: pathlib.Path) -> dict[str, str]:
    """Each prompt's first reply text, keyed by pair id."""
    return {r["pair_id"]: (run / f"{r['index']}_r0.txt").read_text() for r in rows(run) if r["repeat"] == 0}


def text_wer(reference: dict[str, str], candidate: dict[str, str], normalize) -> tuple[dict, dict]:
    """Candidate replies against the baseline's, prompt by prompt."""
    if reference.keys() != candidate.keys():
        raise ValueError("candidate and reference runs cover different prompts")
    per_pair = {pid: [speech.word_errors(normalize(reference[pid]), normalize(candidate[pid]))]
                for pid in reference}
    return speech.wer_summary(per_pair), {pid: _ratio(v) for pid, v in per_pair.items()}


def asr_wer(run: pathlib.Path, transcripts: dict[str, str], normalize) -> tuple[dict, dict]:
    """Every reply's transcript against that reply's own text."""
    per_pair: dict[str, list[tuple[int, int]]] = {}
    for r in rows(run):
        name = f"{r['index']}_r{r['repeat']}"
        own = normalize((run / f"{name}.txt").read_text())
        per_pair.setdefault(r["pair_id"], []).append(speech.word_errors(own, normalize(transcripts[name])))
    return speech.wer_summary(per_pair), {pid: _ratio(v) for pid, v in per_pair.items()}


def _ratio(counts: list[tuple[int, int]]) -> float:
    return round(sum(e for e, _ in counts) / max(1, sum(w for _, w in counts)), 4)


def transcribe(run: pathlib.Path, asr_url: str) -> dict[str, str]:
    """Transcripts of every reply's audio, cached in asr.jsonl."""
    import requests

    cache = run / "asr.jsonl"
    done = {}
    if cache.exists():
        done = {d["name"]: d["text"] for d in map(json.loads, cache.read_text().splitlines()) if d}
    with open(cache, "a") as fh:
        for r in rows(run):
            name = f"{r['index']}_r{r['repeat']}"
            if name in done:
                continue
            with open(run / f"{name}.wav", "rb") as audio:
                resp = requests.post(f"{asr_url}/v1/audio/transcriptions",
                                     files={"file": (f"{name}.wav", audio, "audio/wav")},
                                     data={"model": speech.ASR_MODEL.repo, "language": "en"}, timeout=300)
            resp.raise_for_status()
            done[name] = resp.json().get("text", "")
            fh.write(json.dumps(dict(name=name, text=done[name])) + "\n")
    return done


@contextlib.contextmanager
def asr_server(venv: pathlib.Path, log: pathlib.Path, port: int = ASR_PORT):
    """Qwen3-ASR-1.7B on vLLM at `port` for the block; yields its base URL."""
    import requests

    child_env = dict(os.environ, HF_HUB_OFFLINE="1", VIRTUAL_ENV=str(venv), PATH=f"{venv}/bin:{os.environ['PATH']}")
    with open(log, "w") as fh:
        server = subprocess.Popen(
            [str(venv / "bin" / "vllm"), "serve", speech.ASR_MODEL.repo, "--revision", speech.ASR_MODEL.revision,
             "--port", str(port)],
            env=child_env, stdout=fh, stderr=subprocess.STDOUT, start_new_session=True)
    url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 900
        while True:
            if server.poll() is not None:
                raise RuntimeError(f"ASR server exited with {server.returncode}; see {log}")
            with contextlib.suppress(requests.RequestException):
                if requests.get(f"{url}/health", timeout=5).ok:
                    break
            if time.monotonic() > deadline:
                raise RuntimeError(f"ASR server not ready; see {log}")
            time.sleep(5)
        yield url
    finally:
        if server.poll() is None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(server.pid, signal.SIGTERM)
            try:
                server.wait(timeout=120)
            except subprocess.TimeoutExpired:
                os.killpg(server.pid, signal.SIGKILL)
                server.wait()


def score(candidate: pathlib.Path, reference: pathlib.Path | None, asr_url: str) -> dict:
    from whisper.normalizers import EnglishTextNormalizer

    normalize = EnglishTextNormalizer()
    asr, asr_by_pair = asr_wer(candidate, transcribe(candidate, asr_url), normalize)
    out = dict(reference=str(reference) if reference else None, summary=dict(wer=None, asrWer=asr),
               per_pair={pid: dict(asrWer=v) for pid, v in asr_by_pair.items()})
    if reference is not None:
        wer, by_pair = text_wer(first_texts(reference), first_texts(candidate), normalize)
        out["summary"]["wer"] = wer
        for pid, v in by_pair.items():
            out["per_pair"][pid]["wer"] = v
    (candidate / "scores.json").write_text(json.dumps(out, indent=2) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--candidate", type=pathlib.Path, required=True)
    ap.add_argument("--reference", type=pathlib.Path, default=None, help="the baseline run; omit for the baseline")
    ap.add_argument("--asr-url", default=None)
    ap.add_argument("--asr-venv", type=pathlib.Path, default=None, help="venv whose vllm serves the ASR model")
    args = ap.parse_args()
    if args.asr_url:
        out = score(args.candidate, args.reference, args.asr_url)
    else:
        if args.asr_venv is None:
            ap.error("give --asr-url or --asr-venv")
        with asr_server(args.asr_venv, args.candidate / "asr-server.log") as url:
            out = score(args.candidate, args.reference, url)
    print(json.dumps(out["summary"], indent=2))
    print("SCORE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
