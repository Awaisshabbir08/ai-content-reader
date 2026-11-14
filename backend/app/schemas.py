import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DocLabel = Literal["likely_ai", "mixed", "uncertain", "likely_human"]
SentenceLabel = Literal["likely_ai", "uncertain", "likely_human", "too_short", "not_analyzed"]

DISCLAIMER = (
    "AI detection is probabilistic. This result is an indicator, not proof, and should "
    "never be the only basis for a decision about a person."
)


class DetectRequest(BaseModel):
    text: str = Field(min_length=1)


class Sentence(BaseModel):
    start: int
    end: int
    text: str | None = None
    score: float | None
    label: SentenceLabel
    perplexity: float | None = Field(
        None, description="Perplexity of the sentence's own tokens (null for very short sentences)."
    )


class Thresholds(BaseModel):
    ai_below: float
    human_above: float


class DetectorInfo(BaseModel):
    name: str
    calibrated: bool


class ExtractResponse(BaseModel):
    text: str
    filename: str
    file_type: Literal["txt", "docx", "pdf"]
    word_count: int
    truncated: bool = Field(description="True if the text was cut to the maximum length.")


class DetectResponse(BaseModel):
    id: uuid.UUID
    created_at: datetime | None = None
    label: DocLabel
    ai_probability: float | None = Field(
        description="Calibrated probability that the text is AI-generated (null if uncalibrated)."
    )
    score: float = Field(description="Binoculars score. Lower = more AI-like.")
    thresholds: Thresholds
    word_count: int
    token_count: int
    truncated: bool
    low_reliability: bool
    ai_word_share: float
    longest_ai_run_words: int = Field(
        0, description="Longest unbroken run of sentences labelled likely_ai, in words."
    )
    perplexity: float | None = Field(None, description="Perplexity of the whole text under the performer model.")
    burstiness: float | None = Field(
        None, description="How much perplexity varies between sentences (std / mean). Human writing tends to vary more."
    )
    possibly_non_english: bool = Field(
        False, description="True if the text doesn't look like English. The detector is calibrated on English."
    )
    sentences: list[Sentence]
    detector: DetectorInfo
    disclaimer: str = DISCLAIMER


class JobResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "error"]
    progress: float = Field(description="0 to 1.")
    queue_position: int = Field(description="Jobs that will run before this one.")
    result: DetectResponse | None = None
    error: str | None = None
    error_status: int | None = Field(None, description="HTTP status the same error would have on /detect.")


class InfoResponse(BaseModel):
    detector: str | None
    model_loaded: bool
    calibrated: bool
    thresholds: Thresholds
    mixed_detection: bool = Field(description="True if sentence thresholds for the 'mixed' verdict are calibrated.")
    min_words: int
    reliable_words: int
    max_chars: int
    max_tokens: int
    max_upload_mb: int
    calibration: dict = Field(description="Dataset and accuracy figures from calibration.json.")
