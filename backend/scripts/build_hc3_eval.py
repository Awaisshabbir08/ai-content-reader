"""Build a small, balanced human-vs-AI evaluation set from the HC3 dataset.

HC3 (Hello-SimpleAI/HC3, CC-BY-SA-4.0) pairs human answers with ChatGPT (GPT-3.5)
answers to the same questions. It is a quick sanity set, NOT a production
benchmark: the AI side is one older model, and some human answers carry
tokenisation artifacts. Replace it with your own data (see README).

Download the domain files first (any folder), e.g.:
  https://huggingface.co/datasets/Hello-SimpleAI/HC3/resolve/main/finance.jsonl

Usage:
  python scripts/build_hc3_eval.py --hc3-dir data/hc3 --out data/eval.jsonl --per-class 60
"""

import argparse
import json
import random
import re
from pathlib import Path

DOMAINS = ["finance", "medicine", "open_qa", "wiki_csai", "reddit_eli5"]


def clean(text: str) -> str:
    # Many HC3 ChatGPT answers contain a literal backslash-n instead of line breaks, and no
    # human answer does. Left in, it is a label leak: a detector can learn "\n" = AI.
    text = text.replace("\\n", "\n")
    # Undo the most common HC3 tokenisation artifacts ("word , word" -> "word, word").
    text = re.sub(r"\s+([.,!?;:%)])", r"\1", text)
    text = re.sub(r"([($])\s+", r"\1", text)
    text = re.sub(r"\s+n't\b", "n't", text)
    # HC3 dropped line breaks in many answers, gluing sentences together ("goals.Remember").
    text = re.sub(r"([a-z0-9][.!?:])([A-Z])", r"\1 \2", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hc3-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--per-class", type=int, default=60, help="texts per class per domain")
    parser.add_argument("--min-words", type=int, default=60)
    parser.add_argument("--max-words", type=int, default=600)
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    rows = []
    for domain in DOMAINS:
        path = args.hc3_dir / f"{domain}.jsonl"
        if not path.exists():
            print(f"skip {domain}: {path} not found")
            continue
        pools: dict[str, list[tuple[int, str]]] = {"human": [], "ai": []}
        with path.open(encoding="utf-8") as f:
            for qid, line in enumerate(f):
                item = json.loads(line)
                for label, key in (("human", "human_answers"), ("ai", "chatgpt_answers")):
                    for answer in item.get(key) or []:
                        text = clean(answer or "")
                        if args.min_words <= len(text.split()) <= args.max_words:
                            pools[label].append((qid, text))
        for label, pool in pools.items():
            for qid, text in rng.sample(pool, min(args.per_class, len(pool))):
                # Split by question so the same question never lands in both splits.
                split = "calib" if random.Random(f"{domain}-{qid}").random() < 0.5 else "test"
                rows.append({"text": text, "label": label, "domain": domain, "split": split})
        print(f"{domain}: human pool {len(pools['human'])}, ai pool {len(pools['ai'])}")

    rng.shuffle(rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
