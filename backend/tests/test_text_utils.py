from app.detector.text_utils import count_words, split_sentences


def _sentences(text: str) -> list[str]:
    return [text[s:e] for s, e in split_sentences(text)]


def test_splits_on_sentence_punctuation():
    assert _sentences("First one. Second one! Third one? Fourth.") == [
        "First one.",
        "Second one!",
        "Third one?",
        "Fourth.",
    ]


def test_keeps_closing_quotes_with_sentence():
    assert _sentences('He said "stop." Then he left.') == ['He said "stop."', "Then he left."]


def test_does_not_split_after_abbreviations_or_initials():
    text = "Dr. Smith met J. Doe at noon. They talked, e.g. About work."
    assert _sentences(text) == ["Dr. Smith met J. Doe at noon.", "They talked, e.g. About work."]


def test_newlines_always_split():
    assert _sentences("Title\n\nBody text here\n- item one\n- item two") == [
        "Title",
        "Body text here",
        "- item one",
        "- item two",
    ]


def test_lowercase_after_period_is_not_a_new_sentence():
    assert _sentences("Version 2.5 is out. see the notes.") == ["Version 2.5 is out. see the notes."]


def test_spans_point_into_original_text():
    text = "  Leading space.   Trailing space.  "
    assert [text[s:e] for s, e in split_sentences(text)] == ["Leading space.", "Trailing space."]


def test_count_words():
    assert count_words("Hello, world! It's 2026.") == 5
