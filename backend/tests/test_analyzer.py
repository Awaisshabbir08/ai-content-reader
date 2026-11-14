import pytest

from app.detector.analyzer import TextTooShortError, analyze

from .conftest import FakeScorer, ai_sentence, human_sentence

OPTS = dict(min_words=20, reliable_words=60, min_sentence_tokens=5)


def test_human_text_is_labelled_human(scorer, calibration):
    text = " ".join(human_sentence() for _ in range(5))
    result = analyze(text, scorer, calibration, **OPTS)
    assert result.label == "likely_human"
    assert result.score == pytest.approx(1.0)
    assert result.ai_word_share == 0
    assert result.ai_probability < 0.2
    assert result.low_reliability is True  # 50 words < reliable_words


def test_ai_text_is_labelled_ai(scorer, calibration):
    text = " ".join(ai_sentence() for _ in range(5))
    result = analyze(text, scorer, calibration, **OPTS)
    assert result.label == "likely_ai"
    assert result.ai_word_share == 1
    assert result.ai_probability > 0.9


def test_mixed_text_gets_sentence_level_labels(scorer, calibration):
    parts = [human_sentence(), ai_sentence(), human_sentence(), ai_sentence(), "Ok."]
    result = analyze(" ".join(parts), scorer, calibration, **OPTS)
    labels = [s.label for s in result.sentences]
    assert labels == ["likely_human", "likely_ai", "likely_human", "likely_ai", "too_short"]
    assert result.ai_word_share == pytest.approx(0.5)


def test_text_after_truncation_is_marked_not_analyzed(calibration):
    text = " ".join(human_sentence() for _ in range(4))
    result = analyze(text, FakeScorer(max_tokens=20), calibration, **OPTS)
    assert result.truncated is True
    assert [s.label for s in result.sentences] == [
        "likely_human",
        "likely_human",
        "not_analyzed",
        "not_analyzed",
    ]


def test_short_text_is_rejected(scorer, calibration):
    with pytest.raises(TextTooShortError):
        analyze("Too short to judge.", scorer, calibration, **OPTS)


# --- sentence windows and the "mixed" verdict ---------------------------------

from dataclasses import replace  # noqa: E402

from app.detector.analyzer import SentenceStats, window_scores  # noqa: E402


def _stats():
    return [
        SentenceStats(0, 1, nll=10, xent=10, n_tokens=10, analyzed=True),  # human-like (1.0)
        SentenceStats(2, 3, nll=5, xent=10, n_tokens=10, analyzed=True),  # AI-like (0.5)
        SentenceStats(4, 5, nll=10, xent=10, n_tokens=10, analyzed=True),
        SentenceStats(6, 7, nll=0, xent=0, n_tokens=0, analyzed=True),  # e.g. a lone symbol
        SentenceStats(8, 9, nll=10, xent=10, n_tokens=10, analyzed=False),  # beyond truncation
    ]


def test_window_zero_scores_sentences_alone():
    assert window_scores(_stats(), window_tokens=0, min_tokens=5) == [1.0, 0.5, 1.0, None, None]
    assert window_scores(_stats(), window_tokens=0, min_tokens=11)[:3] == [None, None, None]


def test_windows_grow_outward_until_they_hold_enough_tokens():
    assert window_scores(_stats(), window_tokens=15, min_tokens=5) == [0.75, 0.75, 0.75, None, None]
    # sentence 0 has no left neighbour, so it takes two from the right; never crosses truncation
    assert window_scores(_stats(), window_tokens=25, min_tokens=5)[0] == pytest.approx(25 / 30)


@pytest.fixture
def sentence_calibration(calibration):
    return replace(
        calibration, sentence_ai_threshold=0.7, sentence_human_threshold=0.9, mixed_min_run_words=15
    )


def test_ai_run_inside_human_text_is_mixed(scorer, sentence_calibration):
    parts = [human_sentence()] * 3 + [ai_sentence()] * 2 + [human_sentence()] * 3
    result = analyze(" ".join(parts), scorer, sentence_calibration, **OPTS)
    assert 0.7 < result.score < 0.9  # the document score alone says "uncertain"
    assert result.longest_ai_run_words == 20
    assert result.label == "mixed"


def test_short_ai_runs_are_not_mixed(scorer, sentence_calibration):
    parts = [human_sentence(), ai_sentence()] * 4  # AI sentences never adjacent: runs of 10 words
    result = analyze(" ".join(parts), scorer, sentence_calibration, **OPTS)
    assert result.longest_ai_run_words == 10
    assert result.label != "mixed"


def test_too_short_sentence_does_not_break_an_ai_run(scorer, sentence_calibration):
    parts = [human_sentence()] * 4 + [ai_sentence(), "Ok.", ai_sentence()] + [human_sentence()] * 4
    result = analyze(" ".join(parts), scorer, sentence_calibration, **OPTS)
    assert result.longest_ai_run_words == 20
    assert result.label == "mixed"


def test_ai_document_stays_likely_ai(scorer, sentence_calibration):
    result = analyze(" ".join([ai_sentence()] * 5), scorer, sentence_calibration, **OPTS)
    assert result.label == "likely_ai"


def test_without_sentence_calibration_there_is_no_mixed_verdict(scorer, calibration):
    parts = [human_sentence()] * 3 + [ai_sentence()] * 2 + [human_sentence()] * 3
    assert analyze(" ".join(parts), scorer, calibration, **OPTS).label == "uncertain"


def test_sentence_settings_round_trip(tmp_path, sentence_calibration):
    path = tmp_path / "calibration.json"
    cal = replace(sentence_calibration, sentence_window_tokens=64)
    path.write_text(__import__("json").dumps(cal.to_dict()), encoding="utf-8")
    loaded = type(cal).load(path, cal.observer_model, cal.performer_model)
    assert (loaded.sentence_window_tokens, loaded.sentence_ai_threshold, loaded.mixed_min_run_words) == (
        64, 0.7, 15)
    assert loaded.sentence_label(0.6) == "likely_ai"
    assert loaded.sentence_label(0.8) == "uncertain"


def test_non_english_text_is_flagged(scorer, calibration):
    german = (
        "Die Katze sitzt auf dem Dach und schaut in den Garten hinunter. " * 8
    )
    result = analyze(german, scorer, calibration, min_words=10, reliable_words=150, min_sentence_tokens=3)
    assert result.possibly_non_english is True


def test_english_text_is_not_flagged_and_has_perplexity(scorer, calibration):
    text = "This is the kind of text that we would expect to see in an English essay about a topic. " * 6
    result = analyze(text, scorer, calibration, min_words=10, reliable_words=150, min_sentence_tokens=3)
    assert result.possibly_non_english is False
    assert result.perplexity > 0
    assert all(s.perplexity is not None for s in result.sentences)
    assert result.burstiness == 0.0  # identical sentences: no variation
