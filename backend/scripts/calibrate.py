"""Score a labelled dataset with the detector, choose thresholds, and write calibration.json.

Input: JSONL with {"text": ..., "label": "human"|"ai", "split": "calib"|"test", "domain": ...}.
Thresholds and the probability mapping are fitted on the "calib" split only; metrics
are reported on both splits, so the "test" numbers are an honest held-out estimate.

Scores are cached next to the data (<data>.scores.<model-pair>.jsonl), so you can re-fit
with different targets without re-running the models.

Usage:
  python scripts/calibrate.py --data data/eval.jsonl --out calibration.json
"""

import argparse
import hashlib
import json
import re
import sys
import time
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.detector.binoculars import binoculars_score  # noqa: E402
from app.detector.metrics import auroc, fit_platt, rates, threshold_at_fnr, threshold_at_fpr  # noqa: E402


def score_dataset(rows: list[dict], cache: Path) -> list[float]:
    """Scores are cached by text hash, so editing the dataset only re-scores new texts."""
    keys = [hashlib.sha1(r["text"].encode("utf-8")).hexdigest() for r in rows]
    cached: dict[str, float] = {}
    if cache.exists():
        for line in cache.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            cached[item["key"]] = item["score"]
    todo = [i for i in range(len(rows)) if keys[i] not in cached]
    if todo:
        from app.detector.binoculars import BinocularsDetector

        s = get_settings()
        detector = BinocularsDetector(
            s.observer_model, s.performer_model, s.device, s.max_tokens, s.window_tokens
        )
        started = time.time()
        with cache.open("a", encoding="utf-8") as f:
            for n, i in enumerate(todo, 1):
                tokens = detector.score_tokens(rows[i]["text"])
                cached[keys[i]] = binoculars_score(tokens.nll, tokens.xent)
                f.write(json.dumps({"key": keys[i], "score": cached[keys[i]]}) + "\n")
                f.flush()
                if n % 25 == 0 or n == len(todo):
                    rate = (time.time() - started) / n
                    print(f"  scored {n}/{len(todo)}  ({rate:.2f}s per text)", flush=True)
    return [cached[k] for k in keys]


def split_scores(rows, scores, split=None, domain=None):
    ai, human = [], []
    for row, score in zip(rows, scores):
        if (split and row.get("split") != split) or (domain and row.get("domain") != domain):
            continue
        (ai if row["label"] == "ai" else human).append(score)
    return ai, human


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--target-fpr", type=float, default=0.01, help="max share of human texts flagged AI")
    parser.add_argument("--target-fnr", type=float, default=0.05, help="max share of AI texts called human")
    args = parser.parse_args()

    s = get_settings()
    rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line]
    pair = re.sub(r"[^A-Za-z0-9.-]+", "_", f"{s.observer_model}__{s.performer_model}")
    cache = args.data.with_suffix(f".scores.{pair}.jsonl")
    print(f"Scoring {len(rows)} texts with {s.observer_model} | {s.performer_model} (cache: {cache})")
    scores = score_dataset(rows, cache)

    ai, human = split_scores(rows, scores, split="calib")
    ai_below = threshold_at_fpr(human, args.target_fpr)
    human_above = max(threshold_at_fnr(ai, args.target_fnr), ai_below)
    calib_rows = [(sc, 1 if r["label"] == "ai" else 0) for r, sc in zip(rows, scores) if r.get("split") == "calib"]
    platt_a, platt_b = fit_platt([sc for sc, _ in calib_rows], [y for _, y in calib_rows])

    report = {}
    for split in ("calib", "test"):
        ai_s, human_s = split_scores(rows, scores, split=split)
        report[split] = {
            "n_ai": len(ai_s),
            "n_human": len(human_s),
            "auroc": round(auroc(ai_s, human_s), 4),
            **{k: round(v, 4) for k, v in rates(ai_s, human_s, ai_below, human_above).items()},
        }
    by_domain = defaultdict(dict)
    for domain in sorted({r.get("domain") for r in rows if r.get("domain")}):
        ai_s, human_s = split_scores(rows, scores, split="test", domain=domain)
        if ai_s and human_s:
            by_domain[domain] = {
                "auroc": round(auroc(ai_s, human_s), 4),
                **{k: round(v, 4) for k, v in rates(ai_s, human_s, ai_below, human_above).items()},
            }

    calibration = {
        "observer_model": s.observer_model,
        "performer_model": s.performer_model,
        "ai_threshold": round(ai_below, 5),
        "human_threshold": round(human_above, 5),
        "platt_a": round(platt_a, 5),
        "platt_b": round(platt_b, 5),
        "info": {
            "created": date.today().isoformat(),
            "dataset": str(args.data.name),
            "target_fpr": args.target_fpr,
            "target_fnr": args.target_fnr,
            "metrics": report,
            "test_by_domain": by_domain,
        },
    }
    previous = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    same_pair = (previous.get("observer_model"), previous.get("performer_model")) == (
        s.observer_model, s.performer_model)
    if previous.get("sentences") and same_pair:
        calibration["sentences"] = previous["sentences"]  # kept; re-fit it below
    args.out.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(calibration, indent=2))
    print(f"\nWrote {args.out}")
    print("Next: re-fit the sentence settings, which depend on these thresholds:\n"
          "  python scripts/calibrate_sentences.py --eval data/eval.jsonl --mixed data/mixed.jsonl "
          f"--calibration {args.out}")


if __name__ == "__main__":
    main()
