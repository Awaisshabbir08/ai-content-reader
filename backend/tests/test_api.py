import pytest
from fastapi.testclient import TestClient

from app.main import app, get_detector

from .conftest import FakeScorer, ai_sentence, human_sentence


@pytest.fixture
def client():
    app.dependency_overrides[get_detector] = lambda: FakeScorer()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _text(n_ai: int, n_human: int) -> str:
    return " ".join([ai_sentence()] * n_ai + [human_sentence()] * n_human)


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["calibrated"] is True
    assert body["model_loaded"] is False  # tests run without the real model


def test_detect_returns_labelled_result(client):
    res = client.post("/api/v1/detect", json={"text": _text(n_ai=6, n_human=0)})
    assert res.status_code == 200
    body = res.json()
    assert body["label"] == "likely_ai"
    assert body["thresholds"] == {"ai_below": 0.7, "human_above": 0.9}
    assert body["sentences"][0]["text"].startswith("Robot")
    assert body["created_at"] is not None
    assert "not proof" in body["disclaimer"]
    assert body["longest_ai_run_words"] == 60


def test_stored_scan_does_not_keep_text_by_default(client):
    created = client.post("/api/v1/detect", json={"text": _text(n_ai=3, n_human=3)}).json()
    fetched = client.get(f"/api/v1/scans/{created['id']}").json()
    assert fetched["label"] == created["label"]
    assert fetched["score"] == created["score"]
    assert all(s["text"] is None for s in fetched["sentences"])


def test_short_text_is_422(client):
    res = client.post("/api/v1/detect", json={"text": "Hello there."})
    assert res.status_code == 422
    assert "at least 50" in res.json()["detail"]


def test_unknown_scan_is_404(client):
    assert client.get("/api/v1/scans/00000000-0000-0000-0000-000000000000").status_code == 404


def test_detect_without_model_is_503():
    with TestClient(app) as c:
        assert c.post("/api/v1/detect", json={"text": _text(6, 0)}).status_code == 503


def _wait_for_job(client, job_id: str, timeout: float = 10.0) -> dict:
    import time

    deadline = time.monotonic() + timeout
    while True:
        body = client.get(f"/api/v1/jobs/{job_id}").json()
        if body["status"] in ("done", "error") or time.monotonic() > deadline:
            return body
        time.sleep(0.02)


def test_job_runs_in_background_and_returns_result(client):
    res = client.post("/api/v1/jobs", json={"text": _text(n_ai=6, n_human=0)})
    assert res.status_code == 202
    created = res.json()
    assert created["status"] in ("queued", "running", "done")
    body = _wait_for_job(client, created["id"])
    assert body["status"] == "done"
    assert body["progress"] == 1.0
    assert body["queue_position"] == 0
    assert body["result"]["label"] == "likely_ai"
    assert body["result"]["sentences"][0]["text"].startswith("Robot")


def test_job_rejects_short_text_immediately(client):
    res = client.post("/api/v1/jobs", json={"text": "Too short to judge."})
    assert res.status_code == 422
    assert "at least 50" in res.json()["detail"]


def test_job_rejects_too_long_text(client):
    res = client.post("/api/v1/jobs", json={"text": "word " * 20_000})
    assert res.status_code == 413


def test_unknown_job_is_404(client):
    assert client.get("/api/v1/jobs/nope").status_code == 404


def test_detect_reports_perplexity_burstiness_and_language(client):
    body = client.post("/api/v1/detect", json={"text": _text(n_ai=3, n_human=3)}).json()
    assert body["perplexity"] > 0
    assert body["burstiness"] is not None
    assert body["possibly_non_english"] is True  # "robot robot word word..." is not English
    assert all(s["perplexity"] is not None for s in body["sentences"])


def test_info_reports_limits_and_calibration(client):
    body = client.get("/api/v1/info").json()
    assert body["calibrated"] is True
    assert body["min_words"] == 50
    assert body["thresholds"] == {"ai_below": 0.7, "human_above": 0.9}
    assert body["mixed_detection"] is False
    assert set(body["calibration"]) == {"document", "sentences"}
