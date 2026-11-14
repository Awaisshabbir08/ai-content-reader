"""Build documents that are part human, part AI, from HC3 question/answer pairs.

Each document joins a human answer and a ChatGPT answer to the SAME question as
separate paragraphs, so the topic stays coherent, like someone pasting an AI answer
into their own text. Layouts rotate between human->AI, AI->human and an AI paragraph
inside a human answer. Every row records which character ranges are human and which
are AI, so sentence-level results can be scored against the truth.

Questions are assigned to calib/test with the same rule as build_hc3_eval.py, so a
question never appears in both splits.

Usage:
  python scripts/build_mixed_eval.py --hc3-dir data/hc3 --out data/mixed.jsonl --per-domain 20
"""

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.detector.text_utils import count_words, split_sentences  # noqa: E402
from build_hc3_eval import DOMAINS, clean  # noqa: E402

LAYOUTS = ["human_ai", "ai_human", "human_ai_human"]


def split_human(text: str) -> tuple[str, str] | None:
    """Split a human answer into two halves at a sentence boundary, or None if too short."""
    spans = split_sentences(text)
    if len(spans) < 4 or count_words(text) < 100:
        return None
    cut = spans[len(spans) // 2][0]
    return text[:cut].strip(), text[cut:].strip()


def assemble(parts: list[tuple[str, str]]) -> tuple[str, list[list]]:
    """Join (label, text) parts as paragraphs; return the text and [start, end, label] segments."""
    text, segments = "", []
    for label, part in parts:
        if text:
            text += "\n\n"
        segments.append([len(text), len(text) + len(part), label])
        text += part
    return text, segments


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hc3-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--per-domain", type=int, default=20)
    parser.add_argument("--min-words", type=int, default=60)
    parser.add_argument("--max-words", type=int, default=300)
    parser.add_argument("--seed", type=int, default=29)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    rows = []
    for domain in DOMAINS:
        path = args.hc3_dir / f"{domain}.jsonl"
        if not path.exists():
            print(f"skip {domain}: {path} not found")
            continue
        candidates = []
        with path.open(encoding="utf-8") as f:
            for qid, line in enumerate(f):
                item = json.loads(line)
                pick = []
                for key in ("human_answers", "chatgpt_answers"):
                    ok = [
                        t for t in (clean(a or "") for a in item.get(key) or [])
                        if args.min_words <= count_words(t) <= args.max_words
                    ]
                    pick.append(ok)
                if pick[0] and pick[1]:
                    candidates.append((qid, pick[0][0], pick[1][0]))
        for i, (qid, human, ai) in enumerate(rng.sample(candidates, min(args.per_domain, len(candidates)))):
            layout = LAYOUTS[i % len(LAYOUTS)]
            halves = split_human(human) if layout == "human_ai_human" else None
            if layout == "human_ai_human" and halves is None:
                layout = "human_ai"
            if layout == "human_ai":
                parts = [("human", human), ("ai", ai)]
            elif layout == "ai_human":
                parts = [("ai", ai), ("human", human)]
            else:
                parts = [("human", halves[0]), ("ai", ai), ("human", halves[1])]
            text, segments = assemble(parts)
            split = "calib" if random.Random(f"{domain}-{qid}").random() < 0.5 else "test"
            rows.append(
                {"text": text, "segments": segments, "layout": layout, "domain": domain, "split": split}
            )
        print(f"{domain}: {len(candidates)} questions with both answers")

    rng.shuffle(rows)
    with args.out.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    splits = {s: sum(r["split"] == s for r in rows) for s in ("calib", "test")}
    print(f"wrote {len(rows)} mixed documents to {args.out} ({splits})")


if __name__ == "__main__":
    main()
