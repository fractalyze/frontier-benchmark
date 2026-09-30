"""Device sampling via nvidia-smi: memory, and clock/power/temperature (from qwen-image-opt).

Both samplers read the driver rather than the process. Torch's allocator
counters only see the calling process, and SGLang runs the model in a child
process, so nothing in-process can observe either number for it. An allocator
error also only reports where a run stopped, not what it needed -- sampling
gives the whole curve.
"""

from __future__ import annotations

import subprocess
import threading


class MemorySampler:
    """Polls used VRAM on one GPU until stopped. Steady is the median, which
    ignores the load spike; peak is the max, which is what must fit."""

    def __init__(self, gpu: str = "0", interval_s: float = 0.2):
        self.gpu = gpu
        self.interval_s = interval_s
        self.samples: list[int] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _poll(self) -> None:
        while not self._stop.is_set():
            try:
                out = subprocess.run(
                    ["nvidia-smi", "--query-gpu=memory.used",
                     "--format=csv,noheader,nounits", "-i", self.gpu],
                    capture_output=True, text=True, timeout=5,
                )
                self.samples.append(int(out.stdout.strip()))
            except Exception:
                # A dropped sample must not end the run; the median absorbs it.
                pass
            self._stop.wait(self.interval_s)

    def __enter__(self) -> "MemorySampler":
        self._thread = threading.Thread(target=self._poll, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def summary(self) -> dict:
        if not self.samples:
            return {"steady_mib": None, "peak_mib": None, "n_samples": 0}
        ordered = sorted(self.samples)
        return {
            "steady_mib": ordered[len(ordered) // 2],
            "peak_mib": ordered[-1],
            "n_samples": len(ordered),
        }


class ClockSampler:
    """SM clock, power and temperature sampled *continuously under load*.

    CLAUDE.md: "the clock must be sampled continuously under load -- a single
    `nvidia-smi` stamp between kernels read 1687 MHz against a real 2670." The
    per-rep stamps the harnesses also take are exactly those discredited
    between-kernel reads, and `bench/dmon.py` runs `-s ut`, which has no clock
    column at all -- so without this a row carries no usable clock.

    It also answers the comparability question DECISIONS.md section 7 raises: a
    6 s arm heats the card less per rep than a 13.7 s one, so its reps can still
    be on a thermal ramp when the arm they are divided against was at steady
    state.

    One `nvidia-smi -lms` child streams all three columns, so a sample is one
    line and the three readings within it are simultaneous. `rows` keeps them
    that way for callers that need the joint distribution -- F16's ceiling is
    read off the clock *while* the card draws 600 W, and pairing two
    independently-sampled series would not establish that.
    """

    def __init__(self, gpu: str = "0", interval_ms: int = 200):
        self.gpu, self.interval_ms = gpu, interval_ms
        self.rows: list[tuple[int, float, int]] = []
        self._proc: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None

    @property
    def clocks(self) -> list[int]:
        return [row[0] for row in self.rows]

    @property
    def power_w(self) -> list[float]:
        return [row[1] for row in self.rows]

    @property
    def temps(self) -> list[int]:
        return [row[2] for row in self.rows]

    def _read(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        for line in self._proc.stdout:
            parts = [p.strip() for p in line.split(",")]
            try:
                self.rows.append(
                    (int(parts[0]), float(parts[1]), int(parts[2])))
            except (ValueError, IndexError):
                # '[N/A]' while a counter is momentarily unavailable. Dropping
                # the sample keeps the series clean; ending the stream would
                # silently truncate the run's clock to whatever came first.
                continue

    def __enter__(self) -> "ClockSampler":
        self._proc = subprocess.Popen(
            ["nvidia-smi",
             "--query-gpu=clocks.sm,power.draw,temperature.gpu",
             "--format=csv,noheader,nounits", "-i", self.gpu,
             "-lms", str(self.interval_ms)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        self._thread = threading.Thread(target=self._read, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        if self._proc is not None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def summary(self) -> dict:
        def describe(values: list[float]) -> dict:
            if not values:
                return {}
            ordered = sorted(values)
            n = len(ordered)
            return {"min": ordered[0], "max": ordered[-1],
                    "p50": ordered[n // 2] if n % 2
                    else (ordered[n // 2 - 1] + ordered[n // 2]) / 2}

        temps = self.temps
        out = {"n_samples": len(self.rows),
               "sm_clock_mhz": describe(self.clocks),
               "power_w": describe(self.power_w),
               "temperature_c": describe(temps)}
        if len(temps) >= 6:
            # A run whose last third is still hotter than its first third has
            # not reached steady state, so it is not matched-temperature
            # against an arm that had.
            third = len(temps) // 3
            first = sum(temps[:third]) / third
            last = sum(temps[-third:]) / third
            out["temp_still_rising_c"] = round(last - first, 1)
        return out


def stats(values: list[float]) -> dict:
    """Median, extremes and spread. A delta smaller than an arm's own spread
    is null, so the spread travels with every number."""
    if not values:
        return {}
    ordered = sorted(values)
    n = len(ordered)
    p50 = ordered[n // 2] if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2
    return {
        "p50": p50,
        "min": ordered[0],
        "max": ordered[-1],
        "spread_pct": (ordered[-1] / ordered[0] - 1) * 100 if ordered[0] else None,
        "n": n,
        "all": ordered,
    }
