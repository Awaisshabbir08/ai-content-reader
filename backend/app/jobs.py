"""Background analysis jobs, so a browser doesn't hold one HTTP request open for a minute.

POST /api/v1/jobs queues a text and returns at once; GET /api/v1/jobs/{id} reports the
queue position, progress and, at the end, the result. Jobs run one at a time on a single
worker thread: the models are CPU-bound and serialised by the detector's lock anyway.

The store lives in this process's memory. That's fine for one API process (the default);
running several worker processes would need a shared queue (e.g. Redis + a worker).
"""

import logging
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException

log = logging.getLogger(__name__)

# (tokens scored so far, tokens to score) -> None
Progress = Callable[[int, int], None]
Runner = Callable[[Progress], Any]


class QueueFullError(RuntimeError):
    pass


@dataclass
class Job:
    id: str
    seq: int
    status: str = "queued"  # queued | running | done | error
    progress: float = 0.0
    result: Any = None
    error: str | None = None
    error_status: int | None = None
    finished_at: float | None = None
    _runner: Runner | None = field(default=None, repr=False)  # dropped once it has run


class JobManager:
    def __init__(self, max_pending: int = 20, keep_seconds: float = 600) -> None:
        self.max_pending = max_pending
        self.keep_seconds = keep_seconds  # finished jobs (and their results) are dropped after this long
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="detect-job")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._seq = 0

    def submit(self, runner: Runner) -> Job:
        with self._lock:
            self._prune()
            pending = sum(j.status in ("queued", "running") for j in self._jobs.values())
            if pending >= self.max_pending:
                raise QueueFullError("The server is busy. Please try again in a minute.")
            self._seq += 1
            job = Job(id=uuid.uuid4().hex, seq=self._seq, _runner=runner)
            self._jobs[job.id] = job
        self._executor.submit(self._run, job)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            self._prune()
            return self._jobs.get(job_id)

    def queue_position(self, job: Job) -> int:
        """Jobs that will run before this one (0 when it is running or finished)."""
        if job.status != "queued":
            return 0
        with self._lock:
            return sum(
                j.status == "running" or (j.status == "queued" and j.seq < job.seq) for j in self._jobs.values()
            )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, job: Job) -> None:
        runner, job._runner = job._runner, None
        job.status = "running"

        def progress(done: int, total: int) -> None:
            # Scoring is nearly all of the work; keep 5% for the steps after it.
            job.progress = round(0.95 * done / max(total, 1), 3)

        try:
            job.result = runner(progress)
            job.progress = 1.0
            job.status = "done"
        except HTTPException as exc:
            job.error, job.error_status, job.status = str(exc.detail), exc.status_code, "error"
        except Exception:  # noqa: BLE001 - report any failure to the client instead of hanging
            log.exception("Analysis job %s failed", job.id)
            job.error, job.error_status, job.status = "The analysis failed on the server.", 500, "error"
        finally:
            job.finished_at = time.monotonic()

    def _prune(self) -> None:
        cutoff = time.monotonic() - self.keep_seconds
        for job_id in [j.id for j in self._jobs.values() if j.finished_at and j.finished_at < cutoff]:
            del self._jobs[job_id]
