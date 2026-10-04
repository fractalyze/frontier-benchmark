"""Serve one speech recipe and time its replies; one process per recipe.

    python -m bench.speak --model qwen3-omni --hardware rtx5090 \
        --recipe kernels --prompts "$BENCH_HELDOUT_SPEECH" --out <runs>/kernels

Starts `vllm serve <checkpoint> --omni` from the recipe's engine checkout (under
a private CUDA MPS daemon when the recipe asks for one), sends the warmups, then
every prompt `--repeats` times, one streamed request at a time. Each reply's
text and 24 kHz audio go to `<out>/<i>_r<k>.{txt,wav}`; timings to rows.jsonl;
medians, the engine commit and the contention verdict to manifest.json.

Times are client wall clock from sending the request: ttft to the first text
delta, ttfa to the first audio chunk. A foreign process on the GPU during any
request marks the run DIRTY, and emit refuses it.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import io
import json
import os
import pathlib
import signal
import statistics
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bench import env, protocol, speech  # noqa: E402

PCM_RATE = 24000  # code2wav's output rate, for a chunk that arrives as raw PCM
READY_TIMEOUT_S = 1500  # the first start of a kernel arm compiles its kernels


def _decode_chunk(b64: str):
    import numpy as np
    import soundfile as sf

    raw = base64.b64decode(b64)
    try:
        audio, _ = sf.read(io.BytesIO(raw), dtype="float32")
        return audio
    except sf.LibsndfileError:
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def request(port: int, model: str, prompt: str, seed: int) -> dict:
    """One streamed text-and-audio reply, with its timings in seconds."""
    import numpy as np
    import requests

    body = {"model": model, "messages": [{"role": "user", "content": prompt}],
            "modalities": ["text", "audio"], "stream": True, "seed": seed}
    t0 = time.perf_counter()
    first_text = first_audio = None
    text, chunks, text_times = [], [], []
    with requests.post(f"http://127.0.0.1:{port}/v1/chat/completions", json=body, stream=True,
                       timeout=600) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line.startswith(b"data: ") or line == b"data: [DONE]":
                continue
            msg = json.loads(line[6:])
            is_audio = msg.get("modality") == "audio"
            for choice in msg.get("choices", []):
                content = (choice.get("delta") or {}).get("content")
                if not content:
                    continue
                now = time.perf_counter() - t0
                if is_audio or choice.get("audio_metadata") is not None:
                    first_audio = first_audio or now
                    chunks.append(_decode_chunk(content))
                else:
                    first_text = first_text or now
                    text.append(content)
                    text_times.append(now)
    wall = time.perf_counter() - t0
    audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    seconds = audio.size / PCM_RATE
    if first_audio is None or first_text is None:
        raise RuntimeError(f"reply without {'audio' if first_audio is None else 'text'}: {prompt[:40]!r}")
    pace = (text_times[-1] - text_times[0]) / (len(text_times) - 1) if len(text_times) > 1 else None
    return dict(ttft=first_text, ttfa=first_audio, wall=wall, audio_s=seconds,
                rtf=wall / seconds if seconds else None, chunks=len(chunks),
                text="".join(text), text_s=pace, audio=audio)


def stats(values: list[float]) -> dict:
    return dict(p50=statistics.median(values), min=min(values), max=max(values))


def _git_head(path: pathlib.Path) -> str:
    return subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True,
                          text=True, check=True).stdout.strip()


def _mps_pids() -> set[int]:
    out = subprocess.run(["pgrep", "-u", str(os.getuid()), "-x", "nvidia-cuda-mps-server"],
                         capture_output=True, text=True).stdout
    return {int(p) for p in out.split()}


@contextlib.contextmanager
def serving(spec: speech.SpeechSpec, port: int, log: pathlib.Path):
    """The recipe's server, ready to answer; stopped (and its MPS daemon quit) on exit."""
    head = _git_head(spec.checkout)
    if not head.startswith(spec.engine_version):
        raise RuntimeError(f"{spec.checkout} is at {head[:12]}, recipe engine is {spec.engine_version}")
    cache = pathlib.Path(protocol.HF_HOME) / "hub" / ("models--" + spec.model.repo.replace("/", "--"))
    # The server loads the repo id offline, which resolves refs/main: it must be the pinned snapshot.
    main = (cache / "refs" / "main").read_text().strip() if (cache / "refs" / "main").exists() else None
    if main != spec.model.revision or not (cache / "snapshots" / main).is_dir():
        raise RuntimeError(f"{cache}/refs/main is {main}, not the pinned {spec.model.revision}; "
                           f"run `hf download {spec.model.repo} --revision {spec.model.revision}` "
                           f"and point refs/main at it")
    child_env = dict(os.environ, **spec.env, PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True",
                     HF_HUB_OFFLINE="1", VIRTUAL_ENV=str(spec.venv),
                     # the stages JIT-compile kernels with the venv's toolchain
                     PATH=f"{spec.venv}/bin:{os.environ['PATH']}")
    # A Unix socket path over 108 bytes stops the MPS daemon: keep it short.
    mps_dir = pathlib.Path(f"/tmp/fb-mps-{os.getuid()}")
    if spec.mps:
        child_env.update(CUDA_MPS_PIPE_DIRECTORY=str(mps_dir / "pipe"),
                         CUDA_MPS_LOG_DIRECTORY=str(mps_dir / "log"))
        for sub in ("pipe", "log"):
            (mps_dir / sub).mkdir(parents=True, exist_ok=True)
        subprocess.run(["nvidia-cuda-mps-control", "-d"], env=child_env, check=True)
    server = None
    try:
        with open(log, "w") as fh:
            server = subprocess.Popen(
                [str(spec.venv / "bin" / "vllm"), "serve", spec.model.repo, "--omni", "--port", str(port),
                 "--deploy-config", str(protocol.REPO / spec.deploy)],
                cwd=str(spec.checkout), env=child_env, stdout=fh, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        _wait_ready(server, port, log)
        yield head
    finally:
        if server is not None and server.poll() is None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(server.pid, signal.SIGTERM)
            try:
                server.wait(timeout=120)
            except subprocess.TimeoutExpired:
                os.killpg(server.pid, signal.SIGKILL)
                server.wait()
        if server is not None:
            _wait_session_gone(server.pid)
        if spec.mps:
            subprocess.run(["nvidia-cuda-mps-control"], input="quit\n", text=True, env=child_env)


def _wait_ready(server: subprocess.Popen, port: int, log: pathlib.Path) -> None:
    import requests

    deadline = time.monotonic() + READY_TIMEOUT_S
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"server exited with {server.returncode}; see {log}")
        with contextlib.suppress(requests.RequestException):
            if requests.get(f"http://127.0.0.1:{port}/health", timeout=5).ok:
                return
        time.sleep(5)
    raise RuntimeError(f"server not ready after {READY_TIMEOUT_S}s; see {log}")


def _wait_session_gone(sid: int, budget_s: float = 120.0) -> None:
    """Every stage process the server started has exited (they share its session)."""
    deadline = time.monotonic() + budget_s
    while time.monotonic() < deadline:
        if not subprocess.run(["pgrep", "-s", str(sid)], capture_output=True, text=True).stdout.strip():
            return
        time.sleep(2)
    with contextlib.suppress(ProcessLookupError):
        os.killpg(sid, signal.SIGKILL)


def main() -> int:
    import soundfile as sf

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", required=True)
    ap.add_argument("--hardware", default="rtx5090")
    ap.add_argument("--recipe", required=True)
    ap.add_argument("--prompts", required=True)
    ap.add_argument("--split", default="heldout")
    ap.add_argument("--out", type=pathlib.Path, required=True)
    ap.add_argument("--warmups", type=int, default=len(speech.WARMUP_PROMPTS))
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--port", type=int, default=8091)
    args = ap.parse_args()

    spec = speech.spec_for(args.model, args.hardware, args.recipe)
    pairs = speech.load_prompts(args.prompts, args.split)[: args.limit]
    args.out.mkdir(parents=True, exist_ok=True)
    env.wait_for_quiet()
    rows, dirty = [], False
    with serving(spec, args.port, args.out / "server.log") as commit:
        for k in range(args.warmups):
            request(args.port, spec.model.repo, speech.WARMUP_PROMPTS[k % len(speech.WARMUP_PROMPTS)], 0)
        start = env.gpu_stamp(extra_ours=_mps_pids())
        for i, pair in enumerate(pairs):
            for k in range(args.repeats):
                r = request(args.port, spec.model.repo, pair["prompt"], pair["seed"])
                stamp = env.gpu_stamp(extra_ours=_mps_pids())
                dirty |= env.is_dirty(stamp)
                sf.write(args.out / f"{i}_r{k}.wav", r.pop("audio"), PCM_RATE)
                (args.out / f"{i}_r{k}.txt").write_text(r["text"])
                row = dict(pair_id=pair["pair_id"], index=i, repeat=k, **r, stamp=stamp)
                rows.append(row)
                print(f"{i} r{k}: ttft {r['ttft'] * 1e3:.0f} ms ttfa {r['ttfa'] * 1e3:.0f} ms "
                      f"wall {r['wall']:.2f}s audio {r['audio_s']:.1f}s", flush=True)
    with open(args.out / "rows.jsonl", "w") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    texts: dict[str, set] = {}
    for row in rows:
        texts.setdefault(row["pair_id"], set()).add(row["text"])
    manifest = dict(
        workload="speech", recipe=args.recipe, model=spec.model.repo, revision=spec.model.revision,
        engine_commit=commit, deploy=spec.deploy, mps=spec.mps, env=spec.env,
        prompts=str(args.prompts), split=args.split, pairs=len(pairs), repeats=args.repeats,
        warmups=args.warmups, ttfa=stats([r["ttfa"] for r in rows]), ttft=stats([r["ttft"] for r in rows]),
        rtf=stats([r["rtf"] for r in rows if r["rtf"]]),
        text_s=stats([r["text_s"] for r in rows if r["text_s"]]),
        distinct_texts={pid: len(t) for pid, t in texts.items()},
        dirty=dirty, gpu_start=start,
    )
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("SPEAK_OK", json.dumps(dict(ttfa_ms=round(manifest["ttfa"]["p50"] * 1e3, 1), dirty=dirty)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
