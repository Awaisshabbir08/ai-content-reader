import re

_WORD = re.compile(r"\b\w+\b")

# A sentence ends at . ! ? or … (optionally followed by a closing quote/bracket), then
# whitespace, then something that looks like a sentence start. Blank lines and line
# breaks always end a sentence (headings, list items).
_BOUNDARY = re.compile(
    r"(?:(?<=[.!?…])|(?<=[.!?…][\"'”’)\]]))\s+(?=[\"'“‘(\[]?[A-Z0-9])"
    r"|\n+"
)

_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
    "inc", "ltd", "co", "fig", "no", "vol", "approx", "u.s", "u.k",
}


# Very common English function words. In English prose they make up roughly 40-50% of
# all words; in other languages written in Latin script, usually well under 15%.
_ENGLISH_COMMON = frozenset(
    "the of and to a in is it that for on was with as are be this by at or from but not have "
    "an they which you were his her their has had we can all there been if more when will "
    "would who so no one what about out up into than them some could other its our do these "
    "also how then may such only after most should over i he she my me any very your".split()
)


def count_words(text: str) -> int:
    return len(_WORD.findall(text))


def looks_english(text: str) -> bool:
    """Rough check that a text is English. The detector is calibrated on English only."""
    words = [w.lower() for w in _WORD.findall(text)]
    if not words:
        return True
    return sum(w in _ENGLISH_COMMON for w in words) / len(words) >= 0.15


def split_sentences(text: str) -> list[tuple[int, int]]:
    """Split text into sentences. Returns (start, end) character spans, whitespace-trimmed."""
    spans: list[tuple[int, int]] = []
    start = 0
    for m in _BOUNDARY.finditer(text):
        if "\n" not in m.group() and _ends_with_abbreviation(text[start : m.start()]):
            continue
        _append_trimmed(spans, text, start, m.start())
        start = m.end()
    _append_trimmed(spans, text, start, len(text))
    return spans


def _ends_with_abbreviation(chunk: str) -> bool:
    words = chunk.rstrip("\"'”’)]").split()
    if not words:
        return False
    last = words[-1].lower().rstrip(".!?…")
    return last in _ABBREVIATIONS or (len(last) == 1 and last.isalpha())


def _append_trimmed(spans: list[tuple[int, int]], text: str, start: int, end: int) -> None:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    if end > start:
        spans.append((start, end))
