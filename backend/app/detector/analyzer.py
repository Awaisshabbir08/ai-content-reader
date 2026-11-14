import math
import statistics
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from .binoculars import TokenScores, binoculars_score
from .calibration import LIKELY_AI, MIXED, Calibration
from .text_utils import count_words, looks_english, split_sentences

# (tokens scored so far, tokens to score)
Progress = Callable[[int, int], None]


class TokenScorer(Protocol):
    name: str

    def score_tokens(self, text: str, progress: Progress | None = None) -> TokenScores: ...


class TextTooShortError(ValueError):
    pass


@dataclass
class SentenceStats:
    start: int
    end: int
    nll: float  # summed over the sentence's tokens
    xent: float
    n_tokens: int
    analyzed: bool  # False when the sentence lies beyond the truncation point


@dataclass
class SentenceResult:
    start: int
    end: int
    score: float | None
    label: str  # likely_ai | uncertain | likely_human | too_short | not_analyzed
    perplexity: float | None = None  # performer perplexity of the sentence's own tokens


@dataclass
class AnalysisResult:
    label: str  # likely_ai | mixed | uncertain | likely_human
    score: float
    ai_probability: float | None
    word_count: int
    token_count: int
    scored_tokens: int
    truncated: bool
    low_reliability: bool
    ai_word_share: float  # share of analysed words that sit in sentences labelled likely_ai
    longest_ai_run_words: int  # longest unbroken run of AI-labelled sentences, in words
    sentences: list[SentenceResult]
    perplexity: float = 0.0  # performer perplexity of the whole text
    burstiness: float | None = None  # spread of sentence perplexities (std / mean)
    possibly_non_english: bool = False


def sentence_stats(text: str, tokens: TokenScores) -> list[SentenceStats]:
    """Sum token statistics per sentence. A token belongs to the sentence holding its midpoint."""
    last_scored_char = tokens.spans[-1][1]
    stats: list[SentenceStats] = []
    idx = 0
    for start, end in split_sentences(text):
        nll = xent = 0.0
        n = 0
        while idx < len(tokens.spans) and _mid(tokens.spans[idx]) < end:
            if _mid(tokens.spans[idx]) >= start:
                nll += tokens.nll[idx]
                xent += tokens.xent[idx]
                n += 1
            idx += 1
        stats.append(SentenceStats(start, end, nll, xent, n, analyzed=start < last_scored_char))
    return stats


def window_scores(stats: list[SentenceStats], window_tokens: int, min_tokens: int) -> list[float | None]:
    """Score each analysed sentence together with its neighbours.

    A single sentence has few tokens, so its score is noisy. Each sentence is scored over a
    window that grows outward (left, right, left...) until it holds `window_tokens` tokens.
    With window_tokens=0 every sentence is scored alone and needs at least `min_tokens`.
    Returns None for sentences that can't be scored or weren't analysed.
    """
    n_analyzed = sum(s.analyzed for s in stats)  # analysed sentences form a prefix
    scores: list[float | None] = []
    for i, s in enumerate(stats):
        if not s.analyzed or s.n_tokens == 0 or (window_tokens == 0 and s.n_tokens < min_tokens):
            scores.append(None)
            continue
        lo = hi = i
        nll, xent, n = s.nll, s.xent, s.n_tokens
        while n < window_tokens and (lo > 0 or hi < n_analyzed - 1):
            if lo > 0:
                lo -= 1
                nll, xent, n = nll + stats[lo].nll, xent + stats[lo].xent, n + stats[lo].n_tokens
            if n < window_tokens and hi < n_analyzed - 1:
                hi += 1
                nll, xent, n = nll + stats[hi].nll, xent + stats[hi].xent, n + stats[hi].n_tokens
        scores.append(nll / xent)
    return scores


def analyze(
    text: str,
    scorer: TokenScorer,
    calibration: Calibration,
    *,
    min_words: int,
    reliable_words: int,
    min_sentence_tokens: int,
    progress: Progress | None = None,
) -> AnalysisResult:
    words = count_words(text)
    if words < min_words:
        raise TextTooShortError(
            f"Text has {words} words; at least {min_words} are needed for a meaningful result."
        )

    tokens = scorer.score_tokens(text, progress=progress)
    if not tokens.nll:
        raise TextTooShortError("Text is too short to score.")

    doc_score = binoculars_score(tokens.nll, tokens.xent)
    stats = sentence_stats(text, tokens)
    scores = window_scores(stats, calibration.sentence_window_tokens, min_sentence_tokens)

    sentences: list[SentenceResult] = []
    ai_words = analysed_words = run = longest_run = 0
    for s, score in zip(stats, scores):
        if not s.analyzed:
            sentences.append(SentenceResult(s.start, s.end, None, "not_analyzed"))
            continue
        if score is None:
            sentences.append(SentenceResult(s.start, s.end, None, "too_short"))
            continue  # neither extends nor breaks a run of AI sentences
        label = calibration.sentence_label(score)
        ppl = math.exp(s.nll / s.n_tokens) if s.n_tokens >= min_sentence_tokens else None
        sentences.append(
            SentenceResult(s.start, s.end, round(score, 4), label, None if ppl is None else round(ppl, 2))
        )
        sentence_words = count_words(text[s.start : s.end])
        analysed_words += sentence_words
        if label == LIKELY_AI:
            ai_words += sentence_words
            run += sentence_words
            longest_run = max(longest_run, run)
        else:
            run = 0

    label = calibration.label(doc_score)
    if (
        label != LIKELY_AI
        and calibration.mixed_min_run_words is not None
        and longest_run >= calibration.mixed_min_run_words
    ):
        label = MIXED

    probability = calibration.probability(doc_score)
    sentence_ppl = [x.perplexity for x in sentences if x.perplexity is not None]
    burstiness = (
        statistics.pstdev(sentence_ppl) / statistics.fmean(sentence_ppl) if len(sentence_ppl) >= 3 else None
    )
    return AnalysisResult(
        label=label,
        score=round(doc_score, 4),
        ai_probability=None if probability is None else round(probability, 4),
        word_count=words,
        token_count=tokens.total_tokens,
        scored_tokens=len(tokens.nll),
        truncated=tokens.truncated,
        low_reliability=words < reliable_words,
        ai_word_share=round(ai_words / analysed_words, 4) if analysed_words else 0.0,
        longest_ai_run_words=longest_run,
        sentences=sentences,
        perplexity=round(math.exp(sum(tokens.nll) / len(tokens.nll)), 2),
        burstiness=None if burstiness is None else round(burstiness, 3),
        possibly_non_english=not looks_english(text),
    )


def _mid(span: tuple[int, int]) -> float:
    return (span[0] + span[1]) / 2
