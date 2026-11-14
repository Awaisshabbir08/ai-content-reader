import threading
import time

from fastapi import HTTPException

from app.jobs import JobManager, QueueFullError


def _wait(job, timeout=5.0):
    deadline = time.monotonic() + timeout
    while job.status not in ("done", "error") and time.monotonic() < deadline:
        time.sleep(0.01)


def test_job_reports_progress_and_result():
    jobs = JobManager()
    seen = []
    submitted = threading.Event()
    holder = {}

    def runner(progress):
        submitted.wait(5)
        progress(50, 100)
        seen.append(holder["job"].progress)
        return "result"

    job = holder["job"] = jobs.submit(runner)
    submitted.set()
    _wait(job)
    assert job.status == "done"
    assert job.result == "result"
    assert job.progress == 1.0
    assert seen == [0.475]  # 95% of the bar is for scoring
    jobs.shutdown()


def test_http_errors_are_reported_with_their_status():
    jobs = JobManager()

    def runner(progress):
        raise HTTPException(422, "Too short.")

    job = jobs.submit(runner)
    _wait(job)
    assert (job.status, job.error, job.error_status) == ("error", "Too short.", 422)
    jobs.shutdown()


def test_unexpected_errors_become_500():
    jobs = JobManager()
    job = jobs.submit(lambda progress: 1 / 0)
    _wait(job)
    assert (job.status, job.error_status) == ("error", 500)
    jobs.shutdown()


def test_jobs_run_one_at_a_time_and_report_queue_position():
    jobs = JobManager()
    release = threading.Event()
    first = jobs.submit(lambda progress: release.wait(5))
    second = jobs.submit(lambda progress: "second")
    third = jobs.submit(lambda progress: "third")
    deadline = time.monotonic() + 5
    while first.status != "running" and time.monotonic() < deadline:
        time.sleep(0.01)
    assert jobs.queue_position(first) == 0
    assert jobs.queue_position(second) == 1
    assert jobs.queue_position(third) == 2
    release.set()
    _wait(third)
    assert third.result == "third"
    assert jobs.queue_position(third) == 0
    jobs.shutdown()


def test_full_queue_is_refused():
    jobs = JobManager(max_pending=1)
    release = threading.Event()
    jobs.submit(lambda progress: release.wait(5))
    try:
        jobs.submit(lambda progress: None)
        raise AssertionError("expected QueueFullError")
    except QueueFullError:
        pass
    finally:
        release.set()
        jobs.shutdown()


def test_finished_jobs_are_forgotten_after_keep_seconds():
    jobs = JobManager(keep_seconds=0)
    job = jobs.submit(lambda progress: "x")
    _wait(job)
    jobs.submit(lambda progress: "y")  # submitting prunes old finished jobs
    assert jobs.get(job.id) is None
    jobs.shutdown()
