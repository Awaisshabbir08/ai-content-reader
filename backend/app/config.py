from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """All settings can be overridden with environment variables or a .env file: the one in the
    project root (shared with docker compose) or one in the working directory."""

    model_config = SettingsConfigDict(env_file=(BACKEND_DIR.parent / ".env", ".env"), extra="ignore")

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

    # Humanizer engine: local (free model run by Ollama on this machine) | claude (paid API; the
    # text is sent to Anthropic) | off.
    humanizer_engine: str = "local"
    humanizer_max_words: int = 0  # 0 = engine default: 1,000 words local, 2,000 Claude
    humanizer_timeout_s: float = 600
    # Local engine
    ollama_url: str = "http://localhost:11434"
    # Apache-2.0, about 3 GB of memory. Use an "instruct" model: plain "qwen3:4b" is a reasoning model
    # that writes a long hidden monologue before every answer, which is several times slower.
    humanizer_local_model: str = "qwen3:4b-instruct"
    # Claude engine
    anthropic_api_key: str = ""
    humanizer_model: str = "claude-opus-5-5"
    humanizer_effort: str = "medium"  # low | medium | high: lower is faster and cheaper


@lru_cache
def get_settings() -> Settings:
    return Settings()
