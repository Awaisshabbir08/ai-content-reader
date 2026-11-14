from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """All settings can be overridden with environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Binoculars model pair. Both models must share one tokenizer.
    # Small pair = runs on CPU. On a GPU server, try Qwen/Qwen2.5-7B + Qwen/Qwen2.5-7B-Instruct
    # (and re-run scripts/calibrate.py, because thresholds are model-specific).
    observer_model: str = "Qwen/Qwen2.5-0.5B"
    performer_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    device: str = "auto"  # auto | cpu | cuda
    load_model: bool = True  # tests set this to False

    max_tokens: int = 2048  # longer texts are truncated (the response says so)
    window_tokens: int = 512  # tokens per forward pass
    max_chars: int = 50_000
    max_upload_mb: int = 10

    min_words: int = 50  # below this we refuse to score
    reliable_words: int = 150  # below this the result is flagged as low reliability
    min_sentence_tokens: int = 8  # shorter sentences are not scored individually

    calibration_file: Path = BACKEND_DIR / "calibration.json"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'detector.db').as_posix()}"
    store_text: bool = False  # privacy default: keep scores, not the submitted text

    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
