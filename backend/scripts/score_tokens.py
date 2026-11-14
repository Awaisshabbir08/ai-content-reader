"""Run the detector over JSONL datasets and cache per-token scores.

Sentence- and segment-level calibration (scripts/calibrate_segments.py) needs token
scores, not just one score per document. Storing them once means thresholds can be
re-fitted many times without re-running the models. The cache is keyed by text hash,
so an interrupted run resumes where it stopped.

Usage:
  python scripts/score_tokens.py data/mixed.jsonl data/eval.jsonl
Writes data/<name>.tokens.<model-pair>.jsonl next to each input.
"""

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402


def cache_path(data: Path) -> Path:
    s = get_settings()
    pair = re.sub(r"[^A-Za-z0-9.-]+", "_", f"{s.observer_model}__{s.performer_model}")
    return data.with_suffix(f".tokens.{pair}.jsonl")


def text_key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def load_cache(path: Path) -> dict[str, dict]:
    cached = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line:
                item = json.loads(line)
                cached[item["key"]] = item
    return cached


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data", type=Path, nargs="+")
    args = parser.parse_args()

    detector = None
    for data in args.data:
        rows = [json.loads(line) for line in data.read_text(encoding="utf-8").splitlines() if line]
        cache = cache_path(data)
        done = load_cache(cache)
        todo = [r for r in rows if text_key(r["text"]) not in done]
        print(f"{data.name}: {len(rows)} texts, {len(todo)} to score -> {cache.name}", flush=True)
        if not todo:
            continue
        if detector is None:
            from app.detector.binoculars import BinocularsDetector

            s = get_settings()
            detector = BinocularsDetector(
                s.observer_model, s.performer_model, s.device, s.max_tokens, s.window_tokens
            )
        started = time.time()
        with cache.open("a", encoding="utf-8") as f:
            for n, row in enumerate(todo, 1):
                ts = detector.score_tokens(row["text"])
                item = {
                    "key": text_key(row["text"]),
                    "nll": [round(v, 5) for v in ts.nll],
                    "xent": [round(v, 5) for v in ts.xent],
                    "spans": ts.spans,
                    "total_tokens": ts.total_tokens,
                    "truncated": ts.truncated,
                }
                f.write(json.dumps(item) + "\n")
                f.flush()
                if n % 25 == 0 or n == len(todo):
                    rate = (time.time() - started) / n
                    print(f"  {n}/{len(todo)} ({rate:.1f}s per text)", flush=True)


if __name__ == "__main__":
    main()
