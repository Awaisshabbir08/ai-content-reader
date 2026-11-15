import json
from types import SimpleNamespace
from typing import get_args

import anthropic
import httpx
import httpx2
import pytest
from fastapi.testclient import TestClient

from app.humanizer import TONES, ClaudeHumanizer, HumanizerError, LocalHumanizer, build_humanizer
from app.main import app, get_humanizer
from app.schemas import Tone


def test_tones_match_the_api_schema():
    assert set(TONES) == set(get_args(Tone))


# --- local engine (Ollama) ---


def _local(handler, model: str = "qwen3:4b-instruct") -> LocalHumanizer:
    return LocalHumanizer("http://ollama.test", model, client=httpx.Client(transport=httpx.MockTransport(handler)))


def _chat_reply(content: str, done_reason: str = "stop") -> httpx.Response:
    return httpx.Response(200, json={"message": {"role": "assistant", "content": content}, "done_reason": done_reason})


def test_local_rewrite_sends_prompt_and_cleans_answer():
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return _chat_reply("<think>\n\n</think>\n\nA plain rewrite.")

    rewrite = _local(handler).rewrite("Some text.", "professional")
    assert rewrite.text == "A plain rewrite."
    assert rewrite.model == "qwen3:4b-instruct"
    body = sent[0]
    assert body["model"] == "qwen3:4b-instruct"
    assert body["stream"] is False and body["think"] is False
    assert body["messages"][0]["role"] == "system" and "Professional:" in body["messages"][0]["content"]
    assert body["messages"][1] == {
        "role": "user",
        "content": "<text>\nSome text.\n</text>\n\nThe text above has 2 words; the rewrite should have about the same number.",
    }


def test_local_drops_reasoning_when_only_the_closing_tag_is_in_the_answer():
    # Reasoning models get "<think>" from the prompt template, so the answer starts mid-thought.
    reply = _chat_reply("Okay, the user wants a rewrite. Let me think...\n</think>\n\nThe actual rewrite.")
    assert _local(lambda request: reply).rewrite("Text.", "natural").text == "The actual rewrite."


def test_local_retries_without_think_for_models_that_lack_it():
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        if "think" in body:
            return httpx.Response(400, json={"error": '"qwen2.5:7b" does not support thinking'})
        return _chat_reply("Rewritten.")

    assert _local(handler, "qwen2.5:7b").rewrite("Text.", "natural").text == "Rewritten."
    assert len(sent) == 2 and "think" not in sent[1]


@pytest.mark.parametrize(
    ("response", "status", "words"),
    [
        (httpx.Response(404, json={"error": "model 'qwen3:4b-instruct' not found"}), 503, "ollama pull qwen3:4b-instruct"),
        (httpx.Response(500, json={"error": "out of memory"}), 502, "out of memory"),
        (_chat_reply("Half a rewr", done_reason="length"), 502, "cut off"),
        (_chat_reply("<think>only thoughts</think>"), 502, "empty"),
    ],
)
def test_local_errors_become_clear_messages(response, status, words):
    with pytest.raises(HumanizerError) as info:
        _local(lambda request: response).rewrite("Text.", "natural")
    assert info.value.status == status
    assert words in str(info.value)


def test_local_reports_when_ollama_is_not_running():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    humanizer = _local(handler)
    assert "isn't running" in humanizer.problem()
    with pytest.raises(HumanizerError) as info:
        humanizer.rewrite("Text.", "natural")
    assert info.value.status == 503


def test_local_problem_checks_the_model_is_downloaded():
    def tags(*names):
        return lambda request: httpx.Response(200, json={"models": [{"name": n} for n in names]})

    assert _local(tags("qwen3:4b-instruct", "llama3.2:latest")).problem() is None
    assert _local(tags("llama3.2:latest"), model="llama3.2").problem() is None  # ":latest" is implied
    assert "ollama pull qwen3:4b-instruct" in _local(tags("llama3.2:latest")).problem()


# --- Claude engine ---

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _message(text: str = "Rewritten text.", stop_reason: str = "end_turn", model: str = "claude-opus-5-5"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        model=model,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
    )


class FakeClaude:
    """Stands in for anthropic.Anthropic: records the request and returns a canned message or error."""

    def __init__(self, result=None) -> None:
        self.result = result if result is not None else _message()
        self.calls: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))

    def _stream(self, **params):
        self.calls.append(params)
        if isinstance(self.result, Exception):
            raise self.result
        message = self.result

        class Stream:
            def __enter__(self):
                return SimpleNamespace(get_final_message=lambda: message)

            def __exit__(self, *exc):
                return False

        return Stream()


def _status_error(cls, status: int, body=None):
    return cls("error", response=httpx2.Response(status, request=_REQUEST), body=body)


def test_claude_rewrite_returns_text_and_uses_fallback_for_opus():
    client = FakeClaude(_message("  Here it is, rewritten.  "))
    rewrite = ClaudeHumanizer(client, "claude-opus-5-5").rewrite("Some text to rewrite.", "casual")
    assert rewrite.text == "Here it is, rewritten."
    assert rewrite.model == "claude-opus-5-5"
    call = client.calls[0]
    assert call["fallbacks"] == "default"
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["output_config"] == {"effort": "medium"}
    assert "Casual:" in call["system"]
    assert call["messages"][0]["role"] == "user"
    assert call["messages"][0]["content"].startswith("<text>\nSome text to rewrite.\n</text>\n\nThe text above has 4 words")
    assert "temperature" not in call  # removed from the Claude API


def test_claude_haiku_gets_no_fallback():
    client = FakeClaude()
    ClaudeHumanizer(client, "claude-haiku-5-5", effort="low").rewrite("Text.", "natural")
    assert "fallbacks" not in client.calls[0]
    assert "betas" not in client.calls[0]


def test_claude_echoed_text_tags_are_removed():
    humanizer = ClaudeHumanizer(FakeClaude(_message("<text>\nClean text.\n</text>")), "claude-opus-5-5")
    assert humanizer.rewrite("x", "natural").text == "Clean text."


@pytest.mark.parametrize(
    ("message", "status"),
    [(_message(stop_reason="refusal"), 422), (_message(stop_reason="max_tokens"), 502), (_message(text="  "), 502)],
)
def test_claude_unusable_answers_raise(message, status):
    with pytest.raises(HumanizerError) as info:
        ClaudeHumanizer(FakeClaude(message), "claude-opus-5-5").rewrite("Text.", "natural")
    assert info.value.status == status


@pytest.mark.parametrize(
    ("error", "status", "words"),
    [
        (_status_error(anthropic.AuthenticationError, 401), 502, "not valid"),
        (_status_error(anthropic.NotFoundError, 404), 502, "HUMANIZER_MODEL"),
        (_status_error(anthropic.RateLimitError, 429), 429, "wait a minute"),
        (
            _status_error(
                anthropic.BadRequestError,
                400,
                {"type": "error", "error": {"type": "invalid_request_error", "message": "Your credit balance is too low."}},
            ),
            502,
            "credit balance is too low",
        ),
        (_status_error(anthropic.InternalServerError, 529), 503, "busy"),
        (anthropic.APITimeoutError(request=_REQUEST), 504, "too long"),
        (anthropic.APIConnectionError(request=_REQUEST), 502, "internet"),
    ],
)
def test_claude_api_errors_become_clear_messages(error, status, words):
    with pytest.raises(HumanizerError) as info:
        ClaudeHumanizer(FakeClaude(error), "claude-opus-5-5").rewrite("Text.", "natural")
    assert info.value.status == status
    assert words in str(info.value)


# --- choosing the engine ---


def _settings(**overrides):
    base = dict(
        humanizer_engine="local",
        humanizer_max_words=0,
        humanizer_timeout_s=600,
        ollama_url="http://localhost:11434",
        humanizer_local_model="qwen3:4b-instruct",
        anthropic_api_key="",
        humanizer_model="claude-opus-5-5",
        humanizer_effort="medium",
    )
    return SimpleNamespace(**{**base, **overrides})


def test_local_is_the_default_engine():
    humanizer, problem = build_humanizer(_settings())
    assert problem is None
    assert (humanizer.engine, humanizer.model, humanizer.max_words) == ("local", "qwen3:4b-instruct", 1000)


def test_claude_engine_needs_a_key():
    humanizer, problem = build_humanizer(_settings(humanizer_engine="claude"))
    assert humanizer is None and "ANTHROPIC_API_KEY" in problem
    humanizer, problem = build_humanizer(_settings(humanizer_engine="Claude", anthropic_api_key="sk-ant-test"))
    assert problem is None
    assert (humanizer.engine, humanizer.max_words) == ("claude", 2000)


def test_off_and_unknown_engines():
    assert build_humanizer(_settings(humanizer_engine="off")) == (None, "The humanizer is switched off (HUMANIZER_ENGINE=off).")
    humanizer, problem = build_humanizer(_settings(humanizer_engine="gpt"))
    assert humanizer is None and "Unknown HUMANIZER_ENGINE" in problem


# --- API endpoint ---

_TEXT = "This sentence has exactly ten words in it, nothing more. " * 3  # 30 words


@pytest.fixture
def fake_claude():
    client = FakeClaude(_message("A natural rewrite of the text."))
    app.dependency_overrides[get_humanizer] = lambda: ClaudeHumanizer(client, "claude-opus-5-5")
    yield client
    app.dependency_overrides.clear()


def test_humanize_endpoint_returns_rewrite(fake_claude):
    with TestClient(app) as c:
        res = c.post("/api/v1/humanize", json={"text": _TEXT, "tone": "academic"})
    assert res.status_code == 200
    assert res.json() == {
        "text": "A natural rewrite of the text.",
        "tone": "academic",
        "model": "claude-opus-5-5",
        "word_count": 6,
    }
    assert "Academic:" in fake_claude.calls[0]["system"]


def test_humanize_endpoint_with_local_engine():
    humanizer = _local(lambda request: _chat_reply("Rewritten by the local model."))
    humanizer.max_words = 25
    app.dependency_overrides[get_humanizer] = lambda: humanizer
    try:
        with TestClient(app) as c:
            ok = c.post("/api/v1/humanize", json={"text": "word " * 25})
            too_long = c.post("/api/v1/humanize", json={"text": "word " * 26})
    finally:
        app.dependency_overrides.clear()
    assert ok.status_code == 200 and ok.json()["model"] == "qwen3:4b-instruct"
    assert too_long.status_code == 413 and "up to 25" in too_long.json()["detail"]


def test_humanize_checks_length(fake_claude):
    with TestClient(app) as c:
        short = c.post("/api/v1/humanize", json={"text": "Too short to rewrite."})
        long = c.post("/api/v1/humanize", json={"text": "word " * 2001})
        bad_tone = c.post("/api/v1/humanize", json={"text": _TEXT, "tone": "pirate"})
    assert short.status_code == 422 and "at least 20" in short.json()["detail"]
    assert long.status_code == 413 and "up to 2,000" in long.json()["detail"]
    assert bad_tone.status_code == 422
    assert fake_claude.calls == []  # nothing was sent


def test_humanize_maps_errors_to_status(fake_claude):
    fake_claude.result = _message(stop_reason="refusal")
    with TestClient(app) as c:
        res = c.post("/api/v1/humanize", json={"text": _TEXT})
    assert res.status_code == 422
    assert "declined" in res.json()["detail"]


def test_humanize_when_switched_off_is_503():
    with TestClient(app) as c:  # tests run with HUMANIZER_ENGINE=off
        res = c.post("/api/v1/humanize", json={"text": _TEXT})
        info = c.get("/api/v1/info").json()["humanizer"]
    assert res.status_code == 503
    assert "switched off" in res.json()["detail"]
    assert info == {
        "enabled": False,
        "engine": "off",
        "model": None,
        "problem": "The humanizer is switched off (HUMANIZER_ENGINE=off).",
        "min_words": 20,
        "max_words": 1000,
        "tones": ["natural", "casual", "professional", "academic"],
    }
