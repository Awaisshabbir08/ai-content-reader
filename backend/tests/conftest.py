import json
import os
import re
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="detector-tests-"))
_CALIBRATION = _TMP / "calibration.json"
_CALIBRATION.write_text(
    json.dumps(
        {
            "ai_threshold": 0.7,
            "human_threshold": 0.9,
            "platt_a": -10.0,
            "platt_b": 8.0,
            "observer_model": "Qwen/Qwen2.5-0.5B",
            "performer_model": "Qwen/Qwen2.5-0.5B-Instruct",
        }
    ),
    encoding="utf-8",
)
os.environ.update(
    LOAD_MODEL="false",
    DATABASE_URL=f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    CALIBRATION_FILE=str(_CALIBRATION),
    STORE_TEXT="false",
)

from app.detector.binoculars import TokenScores  # noqa: E402
from app.detector.calibration import Calibration  # noqa: E402


class FakeScorer:
    """One 'token' per word. Words starting with 'robot' look AI-written (score 0.5);
    every other word looks human (score 1.0)."""

    name = "fake"

    def __init__(self, max_tokens: int = 10_000) -> None:
        self.max_tokens = max_tokens

    def score_tokens(self, text: str, progress=None) -> TokenScores:
        matches = list(re.finditer(r"\S+", text))
        kept = matches[: self.max_tokens]
        scored = kept[1:]  # the first token has no left context, as in the real detector
        nll = [0.5 if m.group().lower().startswith("robot") else 1.0 for m in scored]
        if progress is not None:
            progress(len(kept), len(kept))
        return TokenScores(
            nll=nll,
            xent=[1.0] * len(scored),
            spans=[m.span() for m in scored],
            total_tokens=len(matches),
            truncated=len(matches) > len(kept),
        )


@pytest.fixture
def scorer() -> FakeScorer:
    return FakeScorer()


@pytest.fixture
def calibration() -> Calibration:
    return Calibration.load(_CALIBRATION, "Qwen/Qwen2.5-0.5B", "Qwen/Qwen2.5-0.5B-Instruct")


def human_sentence(n: int = 10) -> str:
    return "Word " + " ".join(["word"] * (n - 2)) + " end."


def ai_sentence(n: int = 10) -> str:
    return "Robot " + " ".join(["robot"] * (n - 2)) + " robotend."
