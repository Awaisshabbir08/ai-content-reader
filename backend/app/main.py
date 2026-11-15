import hashlib
import logging
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import Base, Scan, make_engine, make_session_factory
from .detector.analyzer import Progress, TextTooShortError, TokenScorer, analyze
from .detector.calibration import Calibration
from .detector.text_utils import count_words
from .extract import ExtractionError, UnsupportedFileError, extract_text
from .humanizer import MIN_WORDS as HUMANIZE_MIN_WORDS
from .humanizer import TONES, Humanizer, HumanizerError, build_humanizer
from .jobs import Job, JobManager, QueueFullError
from .schemas import (
    DetectorInfo,
    DetectRequest,
    DetectResponse,
    ExtractResponse,
    HumanizeRequest,
    HumanizeResponse,
    HumanizerInfo,
    InfoResponse,
    JobResponse,
    Sentence,
    Thresholds,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    app.state.session_factory = make_session_factory(engine)
    app.state.jobs = JobManager()
    app.state.calibration = Calibration.load(
        settings.calibration_file, settings.observer_model, settings.performer_model
    )
    app.state.detector = None
    if settings.load_model:
        from .detector.binoculars import BinocularsDetector  # heavy import (torch)

        log.info("Loading %s + %s ...", settings.observer_model, settings.performer_model)
        app.state.detector = BinocularsDetector(
            settings.observer_model,
            settings.performer_model,
            device=settings.device,
            max_tokens=settings.max_tokens,
            window_tokens=settings.window_tokens,
        )
        log.info("Detector ready on %s", app.state.detector.device)
    app.state.humanizer, app.state.humanizer_problem = build_humanizer(settings)
    if app.state.humanizer is not None:
        log.info("Humanizer engine: %s (%s)", app.state.humanizer.engine, app.state.humanizer.model)
    yield
    app.state.jobs.shutdown()
    engine.dispose()


app = FastAPI(title="AI Content Detector", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def get_detector(request: Request) -> TokenScorer:
    detector = request.app.state.detector
    if detector is None:
        raise HTTPException(503, "Detector model is not loaded.")
    return detector


def get_calibration(request: Request) -> Calibration:
    return request.app.state.calibration


def get_humanizer(request: Request) -> Humanizer:
    humanizer = request.app.state.humanizer
    if humanizer is None:
        raise HTTPException(503, request.app.state.humanizer_problem or "The humanizer is not set up.")
    return humanizer


@app.get("/health")
def health(request: Request) -> dict:
    detector = request.app.state.detector
    return {
        "status": "ok",
        "model_loaded": detector is not None,
        "detector": getattr(detector, "name", None),
        "calibrated": request.app.state.calibration.calibrated,
    }


@app.get("/api/v1/info", response_model=InfoResponse)
def info(
    request: Request,
    settings: Settings = Depends(get_settings),
    calibration: Calibration = Depends(get_calibration),
) -> InfoResponse:
    """Detector, limits and the accuracy measured during calibration."""
    detector = request.app.state.detector
    humanizer: Humanizer | None = request.app.state.humanizer
    humanizer_problem = humanizer.problem() if humanizer else request.app.state.humanizer_problem
    return InfoResponse(
        detector=getattr(detector, "name", None),
        model_loaded=detector is not None,
        calibrated=calibration.calibrated,
        thresholds=_thresholds(calibration),
        mixed_detection=calibration.mixed_min_run_words is not None,
        min_words=settings.min_words,
        reliable_words=settings.reliable_words,
        max_chars=settings.max_chars,
        max_tokens=settings.max_tokens,
        max_upload_mb=settings.max_upload_mb,
        calibration={"document": calibration.info, "sentences": calibration.sentence_info},
        humanizer=HumanizerInfo(
            enabled=humanizer is not None and humanizer_problem is None,
            engine=humanizer.engine if humanizer else settings.humanizer_engine,
            model=humanizer.model if humanizer else None,
            problem=humanizer_problem,
            min_words=HUMANIZE_MIN_WORDS,
            max_words=humanizer.max_words if humanizer else (settings.humanizer_max_words or 1000),
            tones=list(TONES),
        ),
    )


@app.post("/api/v1/humanize", response_model=HumanizeResponse)
def humanize(
    body: HumanizeRequest,
    settings: Settings = Depends(get_settings),
    humanizer: Humanizer = Depends(get_humanizer),
) -> HumanizeResponse:
    """Rewrite a text so it reads more naturally. The local engine (default) runs a free model on
    this server; the Claude engine sends the text to Anthropic. Takes seconds to a few minutes."""
    _check_length(body.text, settings)
    words = count_words(body.text)
    if words < HUMANIZE_MIN_WORDS:
        raise HTTPException(422, f"Text has {words} words; at least {HUMANIZE_MIN_WORDS} are needed.")
    if words > humanizer.max_words:
        raise HTTPException(
            413, f"Text has {words:,} words; the humanizer takes up to {humanizer.max_words:,} at a time."
        )
    try:
        rewrite = humanizer.rewrite(body.text, body.tone)
    except HumanizerError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return HumanizeResponse(
        text=rewrite.text, tone=body.tone, model=rewrite.model, word_count=count_words(rewrite.text)
    )


@app.post("/api/v1/detect", response_model=DetectResponse)
def detect(
    body: DetectRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    detector: TokenScorer = Depends(get_detector),
    calibration: Calibration = Depends(get_calibration),
) -> DetectResponse:
    """Analyse a text and wait for the result. Long texts can take a minute on a CPU;
    browsers should prefer /api/v1/jobs, which reports progress."""
    _check_length(body.text, settings)
    return _run_detection(request.app, body.text, settings, detector, calibration)


@app.post("/api/v1/jobs", response_model=JobResponse, status_code=202)
def create_job(
    body: DetectRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    detector: TokenScorer = Depends(get_detector),
    calibration: Calibration = Depends(get_calibration),
) -> JobResponse:
    """Queue a text for analysis. Poll GET /api/v1/jobs/{id} for progress and the result."""
    text = body.text
    _check_length(text, settings)
    words = count_words(text)
    if words < settings.min_words:  # fail now rather than after queueing
        raise HTTPException(
            422, f"Text has {words} words; at least {settings.min_words} are needed for a meaningful result."
        )
    jobs: JobManager = request.app.state.jobs
    target = request.app
    try:
        job = jobs.submit(lambda progress: _run_detection(target, text, settings, detector, calibration, progress))
    except QueueFullError as exc:
        raise HTTPException(503, str(exc)) from exc
    return _job_response(jobs, job)


@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, request: Request) -> JobResponse:
    jobs: JobManager = request.app.state.jobs
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found. Finished jobs are kept for 10 minutes.")
    return _job_response(jobs, job)


def _job_response(jobs: JobManager, job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        queue_position=jobs.queue_position(job),
        result=job.result,
        error=job.error,
        error_status=job.error_status,
    )


def _check_length(text: str, settings: Settings) -> None:
    if len(text) > settings.max_chars:
        raise HTTPException(413, f"Text is longer than {settings.max_chars:,} characters.")


def _run_detection(
    target: FastAPI,
    text: str,
    settings: Settings,
    detector: TokenScorer,
    calibration: Calibration,
    progress: Progress | None = None,
) -> DetectResponse:
    try:
        result = analyze(
            text,
            detector,
            calibration,
            min_words=settings.min_words,
            reliable_words=settings.reliable_words,
            min_sentence_tokens=settings.min_sentence_tokens,
            progress=progress,
        )
    except TextTooShortError as exc:
        raise HTTPException(422, str(exc)) from exc

    scan = Scan(
        id=uuid.uuid4(),
        text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        text=text if settings.store_text else None,
        word_count=result.word_count,
        token_count=result.token_count,
        score=result.score,
        ai_probability=result.ai_probability,
        label=result.label,
        detector=detector.name,
        result={
            **{k: v for k, v in asdict(result).items() if k != "sentences"},
            "sentences": [asdict(s) for s in result.sentences],
            "thresholds": _thresholds(calibration).model_dump(),
            "calibrated": calibration.calibrated,
        },
    )
    with target.state.session_factory() as session:
        session.add(scan)
        session.commit()
        session.refresh(scan)  # load server-generated created_at
    return _response(scan, text)


@app.post("/api/v1/extract", response_model=ExtractResponse)
def extract(file: UploadFile, settings: Settings = Depends(get_settings)) -> ExtractResponse:
    """Extract plain text from a .txt, .docx or .pdf file. The file is not stored."""
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413, f"The file is larger than {settings.max_upload_mb} MB.")
    try:
        result = extract_text(file.filename or "", data, settings.max_chars)
    except UnsupportedFileError as exc:
        raise HTTPException(415, str(exc)) from exc
    except ExtractionError as exc:
        raise HTTPException(422, str(exc)) from exc
    return ExtractResponse(
        text=result.text,
        filename=file.filename or "",
        file_type=result.file_type,
        word_count=count_words(result.text),
        truncated=result.truncated,
    )


@app.get("/api/v1/scans/{scan_id}", response_model=DetectResponse)
def get_scan(scan_id: uuid.UUID, session: Session = Depends(get_session)) -> DetectResponse:
    scan = session.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(404, "Scan not found.")
    return _response(scan, scan.text)


def _thresholds(calibration: Calibration) -> Thresholds:
    return Thresholds(ai_below=calibration.ai_threshold, human_above=calibration.human_threshold)


def _response(scan: Scan, text: str | None) -> DetectResponse:
    r = scan.result
    return DetectResponse(
        id=scan.id,
        created_at=scan.created_at,
        label=scan.label,
        ai_probability=scan.ai_probability,
        score=scan.score,
        thresholds=Thresholds(**r["thresholds"]),
        word_count=scan.word_count,
        token_count=scan.token_count,
        truncated=r["truncated"],
        low_reliability=r["low_reliability"],
        ai_word_share=r["ai_word_share"],
        longest_ai_run_words=r.get("longest_ai_run_words", 0),
        perplexity=r.get("perplexity"),
        burstiness=r.get("burstiness"),
        possibly_non_english=r.get("possibly_non_english", False),
        sentences=[
            Sentence(**s, text=text[s["start"] : s["end"]] if text is not None else None)
            for s in r["sentences"]
        ],
        detector=DetectorInfo(name=scan.detector, calibrated=r["calibrated"]),
    )
