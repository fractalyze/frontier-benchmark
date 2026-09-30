"""GPU pinning, contention stamps and the shared GPU lock.

Adapted from qwen-image-opt's bench/env.py, which fixed these conventions for
this machine: GPU0 only (GPU1 negotiates PCIe x4 and is shared), a lock
*directory* with a holder file (mkdir is the atomic primitive), and a stamp on
every measured row so a row taken beside a foreign process is DIRTY.
"""

from __future__ import annotations

import contextlib
import errno
import json
import os
import subprocess
import time

BENCH_GPU = os.environ.get("BENCH_GPU", "0")
# Pinned before torch is imported anywhere in the process.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", BENCH_GPU)
os.environ.setdefault("HF_HOME", "/data/a41/hf-cache")

_FIELDS = (
    "index,name,memory.used,utilization.gpu,temperature.gpu,"
    "clocks.current.sm,pcie.link.width.current,pcie.link.gen.current"
)


def _ancestors(pid: int) -> set[int]:
    chain, seen = set(), 0
    while pid > 1 and seen < 64:
        chain.add(pid)
        try:
            with open(f"/proc/{pid}/status") as fh:
                ppid = next(int(line.split()[1]) for line in fh if line.startswith("PPid:"))
        except (OSError, StopIteration):
            break
        pid, seen = ppid, seen + 1
    return chain


def _is_ours(pid: int) -> bool:
    """SGLang runs the model in a child worker; anything we started is ours."""
    return bool(_ancestors(pid) & ({os.getpid()} | _ancestors(os.getpid())))


def gpu_stamp() -> dict:
    """Physical state of the pinned GPU plus any foreign compute processes."""
    out = subprocess.run(
        ["nvidia-smi", f"--query-gpu={_FIELDS}", "--format=csv,noheader,nounits", "-i", BENCH_GPU],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    idx, name, mem, util, temp, sm, width, gen = [f.strip() for f in out.split(",")]
    procs = subprocess.run(
        ["nvidia-smi", "--query-compute-apps=pid,used_memory,process_name",
         "--format=csv,noheader,nounits", "-i", BENCH_GPU],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    foreign = []
    for line in procs.splitlines():
        if not line.strip():
            continue
        try:
            pid = int(line.split(",")[0].strip())
        except ValueError:
            continue
        if not _is_ours(pid):
            foreign.append(line.strip())
    return {
        "gpu_index": int(idx), "gpu_name": name,
        "memory_used_mib": int(mem), "utilization_pct": int(util),
        "temperature_c": int(temp), "sm_clock_mhz": int(sm),
        "pcie_width": int(width), "pcie_gen": int(gen),
        "foreign_procs": foreign,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


def is_dirty(*stamps: dict) -> bool:
    return any(s["foreign_procs"] for s in stamps)


def wait_for_quiet(quiet_s: float = 10.0, budget_s: float = 1800.0, poll_s: float = 2.0) -> dict:
    """Block until no foreign process has touched the GPU for `quiet_s`.

    Sibling users on this box run GPU jobs without taking the lock, so a run
    has to find a quiet window rather than assume one. Raises after `budget_s`.
    """
    deadline = time.monotonic() + budget_s
    quiet_since = None
    while True:
        stamp = gpu_stamp()
        if stamp["foreign_procs"]:
            quiet_since = None
            print(f"waiting: foreign process on GPU {BENCH_GPU}: {stamp['foreign_procs']}", flush=True)
        elif quiet_since is None:
            quiet_since = time.monotonic()
        elif time.monotonic() - quiet_since >= quiet_s:
            return stamp
        if time.monotonic() > deadline:
            raise RuntimeError(f"GPU {BENCH_GPU} did not go quiet within {budget_s:.0f}s")
        time.sleep(poll_s)


# Both lock paths sibling sessions on this box honour.
LOCK_PATHS = tuple(
    p for p in os.environ.get(
        "BENCH_GPU_LOCKS",
        f"/tmp/claude-1000/gpu-server-gpu{BENCH_GPU}.lock:/data/a41/locks/gpu{BENCH_GPU}.lock",
    ).split(":") if p
)


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def read_holder(path: str) -> dict | None:
    try:
        with open(os.path.join(path, "holder")) as fh:
            text = fh.read().strip()
    except OSError:
        return None
    try:
        record = json.loads(text)
    except ValueError:
        return {"raw": text}
    return record if isinstance(record, dict) else {"raw": text}


def is_stale(path: str) -> bool:
    """Held by a pid that no longer exists. An unreadable holder is NOT stale."""
    record = read_holder(path)
    if record is None:
        return False
    try:
        return not _pid_alive(int(record["pid"]))
    except (KeyError, TypeError, ValueError):
        return False


def release_lock(path: str) -> None:
    with contextlib.suppress(FileNotFoundError):
        os.unlink(os.path.join(path, "holder"))
    with contextlib.suppress(FileNotFoundError):
        os.rmdir(path)


def _acquire(path: str, purpose: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if is_stale(path):
        print(f"lock: breaking stale lock at {path} (holder {read_holder(path)} is gone)")
        release_lock(path)
    try:
        os.mkdir(path)
    except OSError as exc:
        if exc.errno != errno.EEXIST:
            raise
        raise RuntimeError(
            f"GPU lock {path} is held by {read_holder(path)}; refusing to measure "
            f"while a sibling session owns the GPU"
        ) from None
    with open(os.path.join(path, "holder"), "w") as fh:
        fh.write(json.dumps({"pid": os.getpid(), "purpose": purpose,
                             "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z")}))


@contextlib.contextmanager
def gpu_lock(purpose: str, paths: tuple[str, ...] = LOCK_PATHS):
    """Hold every lock path for the block. Refuses (never queues) when held."""
    held: list[str] = []
    try:
        for path in paths:
            _acquire(path, purpose)
            held.append(path)
        yield held
    finally:
        for path in reversed(held):
            release_lock(path)
