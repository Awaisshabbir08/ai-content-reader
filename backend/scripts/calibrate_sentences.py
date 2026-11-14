"""Fit sentence-level thresholds and the "mixed" verdict, and add them to calibration.json.

Needs cached token scores (scripts/score_tokens.py) for:
  --eval   pure human / pure AI texts (data/eval.jsonl)
  --mixed  part-human, part-AI documents with known boundaries (data/mixed.jsonl)

Steps, all fitted on the "calib" split:
  1. Window size: how many tokens of context each sentence is scored with. Chosen by
     how well window scores separate AI from human sentences inside mixed documents.
  2. Sentence thresholds: at most --target-fpr of human-written words are labelled AI,
     at most --target-fnr of AI-written words are labelled human.
  3. Mixed rule: a document that isn't "likely AI" overall is "mixed" when it holds an
     unbroken run of AI-labelled sentences at least R words long. R is the shortest run
     that at most --mixed-fpr of pure-human documents reach by chance.
Results are then reported on the held-out "test" split by running the same analyze()
code the API uses, so the numbers match what users see.

Usage:
  python scripts/calibrate_sentences.py --eval data/eval.jsonl --mixed data/mixed.jsonl \
      --calibration calibration.json
"""

import argparse
import json
import sys
from collections import Counter
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import get_settings  # noqa: E402
from app.detector.analyzer import analyze, sentence_stats, window_scores  # noqa: E402
from app.detector.binoculars import TokenScores  # noqa: E402
from app.detector.calibration import LIKELY_AI, Calibration  # noqa: E402
from app.detector.metrics import auroc, weighted_threshold_at_fnr, weighted_threshold_at_fpr  # noqa: E402
from app.detector.text_utils import count_words  # noqa: E402
from score_tokens import cache_path, load_cache, text_key  # noqa: E402

DOC_LABELS = ["likely_human", "uncertain", "mixed", "likely_ai"]


class CachedScorer:
    """Serves token scores from the score_tokens.py cache instead of running the models."""

    name = "cache"

    def __init__(self, cache: dict[str, dict]) -> None:
        self.cache = cache

    def score_tokens(self, text: str, progress=None) -> TokenScores:
        item = self.cache[text_key(text)]
        return TokenScores(
            nll=item["nll"],
            xent=item["xent"],
            spans=[tuple(s) for s in item["spans"]],
            total_tokens=item["total_tokens"],
            truncated=item["truncated"],
        )


def truth(row: dict, start: int, end: int) -> str:
    """Ground-truth author of a sentence: the row label, or the segment holding its midpoint."""
    if "segments" not in row:
        return row["label"]
    mid = (start + end) / 2
    return min(row["segments"], key=lambda seg: 0 if seg[0] <= mid < seg[1] else min(
        abs(mid - seg[0]), abs(mid - seg[1])))[2]


def sentences(rows, scorer, window: int, min_tokens: int):
    """(score, words, truth) for every scored sentence."""
    out = []
    for row in rows:
        stats = sentence_stats(row["text"], scorer.score_tokens(row["text"]))
        for s, score in zip(stats, window_scores(stats, window, min_tokens)):
            if score is not None:
                out.append((score, count_words(row["text"][s.start : s.end]), truth(row, s.start, s.end)))
    return out


def sentence_auroc(items) -> float:
    ai = [sc for sc, _, t in items if t == "ai"]
    human = [sc for sc, _, t in items if t == "human"]
    return auroc(ai, human)


def word_rates(items, cal: Calibration) -> dict:
    """Word-weighted: share of human words labelled AI, share of AI words labelled AI."""
    words = Counter()
    for score, n, t in items:
        words[(t, cal.sentence_label(score))] += n
    human = sum(v for (t, _), v in words.items() if t == "human")
    ai = sum(v for (t, _), v in words.items() if t == "ai")
    return {
        "human_words_flagged_ai": round(words[("human", LIKELY_AI)] / human, 4) if human else None,
        "ai_words_flagged_ai": round(words[("ai", LIKELY_AI)] / ai, 4) if ai else None,
    }


def doc_labels(rows, scorer, cal: Calibration, opts: dict) -> dict:
    counts = Counter(analyze(r["text"], scorer, cal, **opts).label for r in rows)
    return {label: round(counts[label] / len(rows), 4) for label in DOC_LABELS} | {"n": len(rows)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", type=Path, required=True)
    parser.add_argument("--mixed", type=Path, required=True)
    parser.add_argument("--calibration", type=Path, required=True)
    parser.add_argument("--windows", default="0,32,64,96,128", help="candidate window sizes (tokens)")
    parser.add_argument("--target-fpr", type=float, default=0.02, help="max share of human words flagged AI")
    parser.add_argument("--target-fnr", type=float, default=0.10, help="max share of AI words called human")
    parser.add_argument("--mixed-fpr", type=float, default=0.05, help="max share of human docs called mixed")
    parser.add_argument("--min-run", type=int, default=20, help="never call a run shorter than this mixed")
    args = parser.parse_args()

    s = get_settings()
    base = Calibration.load(args.calibration, s.observer_model, s.performer_model)
    if not base.calibrated:
        sys.exit("Run scripts/calibrate.py for this model pair first.")
    opts = dict(min_words=s.min_words, reliable_words=s.reliable_words, min_sentence_tokens=s.min_sentence_tokens)

    data = {}
    for name, path in (("eval", args.eval), ("mixed", args.mixed)):
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
        cache = load_cache(cache_path(path))
        missing = [r for r in rows if text_key(r["text"]) not in cache]
        if missing:
            sys.exit(f"{len(missing)} texts in {path} have no token scores. Run scripts/score_tokens.py first.")
        data[name] = rows
        data.setdefault("cache", {}).update(cache)
    scorer = CachedScorer(data["cache"])

    def subset(name, split, label=None):
        return [r for r in data[name] if r["split"] == split and (label is None or r["label"] == label)]

    # 1. Window size, chosen on calib mixed documents.
    print("window  sentence AUROC (calib mixed docs)  (calib pure docs)")
    window_report = {}
    for w in (int(x) for x in args.windows.split(",")):
        mixed_auc = sentence_auroc(sentences(subset("mixed", "calib"), scorer, w, s.min_sentence_tokens))
        pure_auc = sentence_auroc(sentences(subset("eval", "calib"), scorer, w, s.min_sentence_tokens))
        window_report[w] = {"mixed_auroc": round(mixed_auc, 4), "pure_auroc": round(pure_auc, 4)}
        print(f"{w:6}  {mixed_auc:.4f}                             {pure_auc:.4f}")
    window = max(window_report, key=lambda w: (window_report[w]["mixed_auroc"], -w))

    # 2. Sentence thresholds from pure calib documents, weighted by words.
    pure = sentences(subset("eval", "calib"), scorer, window, s.min_sentence_tokens)
    human = [(sc, n) for sc, n, t in pure if t == "human"]
    ai = [(sc, n) for sc, n, t in pure if t == "ai"]
    ai_below = weighted_threshold_at_fpr([x for x, _ in human], [n for _, n in human], args.target_fpr)
    human_above = max(weighted_threshold_at_fnr([x for x, _ in ai], [n for _, n in ai], args.target_fnr), ai_below)
    cal = replace(base, sentence_window_tokens=window, sentence_ai_threshold=round(ai_below, 5),
                  sentence_human_threshold=round(human_above, 5), mixed_min_run_words=None)

    # 3. Shortest AI run that pure-human calib documents rarely reach.
    runs = [analyze(r["text"], scorer, cal, **opts).longest_ai_run_words for r in subset("eval", "calib", "human")]
    candidates = sorted({args.min_run} | {x + 1 for x in runs if x + 1 > args.min_run})
    min_run = next(r for r in candidates if sum(x >= r for x in runs) / len(runs) <= args.mixed_fpr)
    cal = replace(cal, mixed_min_run_words=min_run)

    # 4. Report, mainly on test.
    report = {"window_tokens": window_report}
    for split in ("calib", "test"):
        mixed_rows = subset("mixed", split)
        mixed_sents = sentences(mixed_rows, scorer, window, s.min_sentence_tokens)
        report[split] = {
            "docs_human": doc_labels(subset("eval", split, "human"), scorer, cal, opts),
            "docs_ai": doc_labels(subset("eval", split, "ai"), scorer, cal, opts),
            "docs_mixed": doc_labels(mixed_rows, scorer, cal, opts),
            "sentences_pure": word_rates(sentences(subset("eval", split), scorer, window, s.min_sentence_tokens), cal),
            "sentences_mixed": word_rates(mixed_sents, cal),
            "sentence_auroc_mixed": round(sentence_auroc(mixed_sents), 4),
            "sentence_auroc_mixed_unsmoothed": round(sentence_auroc(
                sentences(mixed_rows, scorer, 0, s.min_sentence_tokens)), 4),
        }
    cal = replace(cal, sentence_info={
        "dataset": f"{args.eval.name} + {args.mixed.name}",
        "target_fpr": args.target_fpr, "target_fnr": args.target_fnr, "mixed_fpr": args.mixed_fpr,
        "metrics": report,
    })

    out = json.loads(args.calibration.read_text(encoding="utf-8"))
    out["sentences"] = cal.to_dict()["sentences"]
    args.calibration.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out["sentences"], indent=2))
    print(f"\nWrote the sentence settings to {args.calibration}")


if __name__ == "__main__":
    main()
