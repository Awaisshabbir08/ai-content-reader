import json
import logging
import math
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

LIKELY_AI = "likely_ai"
MIXED = "mixed"
UNCERTAIN = "uncertain"
LIKELY_HUMAN = "likely_human"


@dataclass
class Calibration:
    """Decision thresholds for one observer/performer pair. Lower score = more AI-like.

    Document:
      score <  ai_threshold     -> likely_ai     (set for ~1% false positives on human text)
      score >  human_threshold  -> likely_human
      otherwise                 -> uncertain
      not likely_ai, but a run of AI-labelled sentences >= mixed_min_run_words -> mixed

    Sentences are scored over a window of about `sentence_window_tokens` tokens and use
    their own thresholds (from scripts/calibrate_sentences.py). Without them, sentences
    are scored alone against the document thresholds and there is no "mixed" verdict.
    """

    ai_threshold: float
    human_threshold: float
    platt_a: float | None = None  # P(AI) = sigmoid(platt_a * score + platt_b)
    platt_b: float | None = None
    observer_model: str | None = None
    performer_model: str | None = None
    calibrated: bool = False
    info: dict = field(default_factory=dict)
    sentence_window_tokens: int = 0
    sentence_ai_threshold: float | None = None
    sentence_human_threshold: float | None = None
    mixed_min_run_words: int | None = None
    sentence_info: dict = field(default_factory=dict)

    def label(self, score: float) -> str:
        return _band(score, self.ai_threshold, self.human_threshold)

    def sentence_label(self, score: float) -> str:
        if self.sentence_ai_threshold is None or self.sentence_human_threshold is None:
            return self.label(score)
        return _band(score, self.sentence_ai_threshold, self.sentence_human_threshold)

    def probability(self, score: float) -> float | None:
        if self.platt_a is None or self.platt_b is None:
            return None
        z = self.platt_a * score + self.platt_b
        return 1.0 / (1.0 + math.exp(-z)) if z >= 0 else math.exp(z) / (1.0 + math.exp(z))

    @classmethod
    def load(cls, path: Path, observer_model: str, performer_model: str) -> "Calibration":
        if not path.exists():
            log.warning("No calibration file at %s; using rough default thresholds.", path)
            return cls.uncalibrated()
        data = json.loads(path.read_text(encoding="utf-8"))
        sentences = data.get("sentences") or {}
        cal = cls(
            ai_threshold=data["ai_threshold"],
            human_threshold=data["human_threshold"],
            platt_a=data.get("platt_a"),
            platt_b=data.get("platt_b"),
            observer_model=data.get("observer_model"),
            performer_model=data.get("performer_model"),
            calibrated=True,
            info=data.get("info", {}),
            sentence_window_tokens=sentences.get("window_tokens", 0),
            sentence_ai_threshold=sentences.get("ai_threshold"),
            sentence_human_threshold=sentences.get("human_threshold"),
            mixed_min_run_words=sentences.get("mixed_min_run_words"),
            sentence_info=sentences.get("info", {}),
        )
        if (cal.observer_model, cal.performer_model) != (observer_model, performer_model):
            log.warning(
                "calibration.json was made for %s|%s but the detector uses %s|%s. "
                "Thresholds will be wrong until you re-run scripts/calibrate.py.",
                cal.observer_model, cal.performer_model, observer_model, performer_model,
            )
            cal.calibrated = False
        return cal

    @classmethod
    def uncalibrated(cls) -> "Calibration":
        # Values from the Binoculars paper (Falcon-7B pair). Only a placeholder.
        return cls(ai_threshold=0.8536, human_threshold=0.9015)

    def to_dict(self) -> dict:
        data = {
            "ai_threshold": self.ai_threshold,
            "human_threshold": self.human_threshold,
            "platt_a": self.platt_a,
            "platt_b": self.platt_b,
            "observer_model": self.observer_model,
            "performer_model": self.performer_model,
            "info": self.info,
        }
        if self.sentence_ai_threshold is not None:
            data["sentences"] = {
                "window_tokens": self.sentence_window_tokens,
                "ai_threshold": self.sentence_ai_threshold,
                "human_threshold": self.sentence_human_threshold,
                "mixed_min_run_words": self.mixed_min_run_words,
                "info": self.sentence_info,
            }
        return data


def _band(score: float, ai_below: float, human_above: float) -> str:
    if score < ai_below:
        return LIKELY_AI
    if score > human_above:
        return LIKELY_HUMAN
    return UNCERTAIN
