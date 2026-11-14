# AI Content Detector

Estimates whether a text was written by AI, gives an overall verdict with a probability, and highlights
AI-like sentences. Everything runs on your own infrastructure with open-source models — no paid
third-party service.

**Status:** Phase 1 MVP plus a web workspace: English text, pasted or uploaded (TXT, DOCX, PDF),
zero-shot engine, a "Mixed" verdict for partly AI-written documents, and writing tools.

## Features

**AI detection** (runs on the server)

- **AI Detector**: paste text or drop a file; get a verdict, a calibrated AI probability, the share of
  AI-like words, perplexity and burstiness, sentence highlights, and a per-sentence perplexity chart
  (with a table view). Sample texts (human, AI, mixed) to try it. A progress bar shows the queue
  position and time left; the analysis keeps running if you open another page.
- **Batch files**: up to 20 `.txt`/`.docx`/`.pdf` files, analysed one after another, with CSV export.
- **History**: the last 30 scans with their highlights, searchable, stored only in the browser
  (localStorage).
- **Reports**: "Download PDF report" (print to PDF), copy a text summary, or export the raw JSON.

**Writing tools** (run entirely in the browser; the text never leaves the device)

- **Word counter**: words, characters, sentences, paragraphs, reading and speaking time, keyword
  density, repeated phrases.
- **Readability & style**: Flesch reading ease, Flesch–Kincaid, Gunning fog, SMOG, Coleman–Liau and
  ARI, plus highlights for long sentences, passive voice, adverbs, filler words, wordy phrases and
  phrases chatbots overuse.
- **Summarizer**: extractive (TextRank), short/medium/long, paragraph or bullets. It picks sentences and
  never rewrites them, so it can't invent content.
- **Citation generator**: APA 7, MLA 9, Chicago 17 and Harvard for websites, books and journal articles;
  in-text citations; a bibliography; copying keeps italics when pasted into Word or Google Docs.

The text you type is shared between the detector and the writing tools, so you paste it once.
**How it works** shows the measured accuracy (read live from `/api/v1/info`), and **API** documents the
endpoints.

Not included on purpose: an "AI humanizer" (its only purpose is to defeat detectors like this one), and
tools that need a text-generation model (paraphraser, grammar correction, translation). Those would need
either a much larger local model (GPU) or an external LLM API, which sends user text to a third party.

## How it works

The engine is **Binoculars** ([Hans et al., 2024](https://arxiv.org/abs/2401.12070)), a zero-shot
detector: it needs no training. Two related language models (an *observer* base model and a *performer*
instruct model) read the text:

- **perplexity**: how surprised the performer is by the actual words,
- **cross-perplexity**: how surprised the performer is, on average, by what the observer expected.

`score = log-perplexity / cross-perplexity`. AI text is unusually predictable *relative to what a model
would expect anyway*, so it gets a **low** score. Human text gets a **high** score.

Thresholds and the probability mapping depend on the model pair, so they are fitted on labelled data
by `backend/scripts/calibrate.py` and stored in `backend/calibration.json`:

| Document score | Label |
|---|---|
| below `ai_threshold` (set for ≤1% false positives on human text) | Likely AI |
| not Likely AI, but the text contains a long unbroken run of AI-like sentences | Mixed |
| between the thresholds | Uncertain |
| above `human_threshold` | Likely human |

**Sentence highlights.** One sentence has too few tokens for a stable score, so each sentence is scored
together with its neighbours, in a window of a few dozen tokens (the size is picked during calibration
and stored in `calibration.json`). Sentence thresholds are fitted separately
(`scripts/calibrate_sentences.py`) so that only a small share of human-written words gets highlighted.
A document is **Mixed** when its AI-like sentences form a run longer than pure-human texts produce by
chance, for example an AI-written paragraph pasted into an essay. Highlights are still much noisier than
the document verdict.

Default models: `Qwen/Qwen2.5-0.5B` + `Qwen/Qwen2.5-0.5B-Instruct` (Apache-2.0, run on CPU). Larger pairs
(e.g. the 7B Qwen2.5 pair on a GPU) are more accurate. Set `OBSERVER_MODEL` / `PERFORMER_MODEL` and
re-run calibration.

## Project layout

```
backend/            FastAPI + PyTorch/Transformers
  app/main.py         API: detect, jobs, extract, scans, info, health
  app/jobs.py         background analysis jobs (one worker thread, in-memory queue)
  app/extract.py      text from uploaded TXT / DOCX / PDF files (in memory, never stored)
  app/detector/       binoculars.py (engine), analyzer.py (doc + sentence results),
                      calibration.py (thresholds), metrics.py (AUROC, FPR...), text_utils.py
  scripts/            build_hc3_eval.py, build_mixed_eval.py (datasets), calibrate.py (document
                      thresholds), score_tokens.py + calibrate_sentences.py (sentence settings)
  calibration.json    thresholds for the default model pair
  tests/              pytest (no model download needed)
frontend/           Next.js 16 + Tailwind
  src/app/            pages (/, /batch, /history, /word-counter, /readability, /summarizer,
                      /citation-generator, /how-it-works, /api-docs); src/app/api/* proxy to the backend
  src/components/     Detector, Result, SentenceChart, Batch, History and the writing tools
  src/lib/            api client (job polling), stores, text-stats, style-check, summarize, citation
docker-compose.yml  db (Postgres 16) + api + web
```

## Run with Docker

```bash
docker compose up --build
```

Open http://localhost:3000. The first start downloads the models (~2 GB) into the `hf-cache` volume.
The API is at http://localhost:8000 (interactive docs at `/docs`). If port 3000 or 8000 is already in use,
set `WEB_PORT` / `API_PORT` in `.env`, for example `WEB_PORT=3005`.

The API container needs about 4 GB of RAM for the two models. If Docker's VM is short of memory, it swaps
and detection gets several times slower (Docker Desktop on Windows: raise `memory` in `%UserProfile%\.wslconfig`).

## Run locally (development)

Backend (Python 3.11–3.13):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; on Linux/macOS: source .venv/bin/activate
pip install torch -r requirements-dev.txt
pytest                             # fast, uses a fake model
uvicorn app.main:app --reload      # SQLite by default; set DATABASE_URL for Postgres
```

Frontend:

```bash
cd frontend
npm install
npm run dev                        # http://localhost:3000, expects the API on :8000 (override with API_URL)
```

## API

```bash
curl -X POST http://localhost:8000/api/v1/detect -H "Content-Type: application/json" \
     -d '{"text": "…at least 50 words…"}'
```

Response (abridged):

```json
{
  "id": "…", "label": "likely_ai", "ai_probability": 0.93, "score": 0.71,
  "thresholds": {"ai_below": 0.796, "human_above": 0.961},
  "word_count": 212, "low_reliability": false, "truncated": false, "ai_word_share": 0.8,
  "longest_ai_run_words": 170, "perplexity": 6.9, "burstiness": 0.31, "possibly_non_english": false,
  "sentences": [{"start": 0, "end": 84, "text": "…", "score": 0.69, "label": "likely_ai", "perplexity": 5.8}],
  "disclaimer": "AI detection is probabilistic…"
}
```

`label` is one of `likely_ai`, `mixed`, `uncertain`, `likely_human`. Sentence labels are `likely_ai`,
`uncertain`, `likely_human`, `too_short` or `not_analyzed`. Sentence `start`/`end` are Unicode code-point
offsets into the submitted text. Texts under 50 words are rejected (422). Under 150 words the result is
flagged `low_reliability`. Text beyond 2,048 tokens is not analysed (`truncated: true`).
`perplexity` is the performer model's perplexity over the text; `burstiness` is the spread of sentence
perplexities (standard deviation / mean). Both are shown for context; the verdict comes from the
Binoculars score. `possibly_non_english` is a rough check (share of common English words), because the
thresholds were calibrated on English.

**Files:** `POST /api/v1/extract` (multipart, field `file`) returns the text of a `.txt`, `.docx` or
`.pdf` file, up to 10 MB, as `{"text", "filename", "file_type", "word_count", "truncated"}`. Send that
text to `/detect`. Files are read in memory and never stored. Scanned PDFs (images without a text layer)
need OCR, which isn't supported yet (422).

```bash
curl -F "file=@essay.pdf" http://localhost:8000/api/v1/extract
```

**Privacy:** by default the database stores scores, labels and a SHA-256 of the text, **not the text
itself**. Set `STORE_TEXT=true` to keep it.

## Calibration and evaluation

```bash
cd backend
# 1. Get labelled data. Quick start: HC3 (human vs ChatGPT answers, CC-BY-SA-4.0)
#    Download finance/medicine/open_qa/wiki_csai/reddit_eli5 .jsonl from
#    https://huggingface.co/datasets/Hello-SimpleAI/HC3 into data/hc3/
python scripts/build_hc3_eval.py --hc3-dir data/hc3 --out data/eval.jsonl --per-class 60
# 2. Score it and fit thresholds on the "calib" split; metrics are reported on the held-out "test" split
python scripts/calibrate.py --data data/eval.jsonl --out calibration.json
# 3. Sentence highlights and the "Mixed" verdict: build part-human, part-AI documents, store per-token
#    scores (about 1 hour on CPU), then fit the sentence settings into calibration.json
python scripts/build_mixed_eval.py --hc3-dir data/hc3 --out data/mixed.jsonl --per-domain 20
python scripts/score_tokens.py data/mixed.jsonl data/eval.jsonl
python scripts/calibrate_sentences.py --eval data/eval.jsonl --mixed data/mixed.jsonl --calibration calibration.json
```

You can plug in your own data: any JSONL with `{"text", "label": "human"|"ai", "split": "calib"|"test",
"domain"}`. Mixed documents also need `"segments": [[start, end, "human"|"ai"], ...]`. Re-run step 3
whenever step 2 changes, because the Mixed rule builds on the document thresholds.

### Current results (default Qwen2.5-0.5B pair, CPU)

Calibrated on 2026-11-13 with 600 HC3 texts (300 human, 300 ChatGPT/GPT-3.5, five domains, median about
140 words) and 100 part-human, part-AI documents, split by question into `calib` and `test`. Everything
was fitted on `calib`; the numbers below come from the held-out `test` split (153 human, 147 AI, 56 mixed
documents).

| Metric | Result |
|---|---|
| AUROC (how well scores separate human from AI) | **0.94** |
| Human texts wrongly labelled "Likely AI" | 2.0% (3 of 153, all in `open_qa`; the target was 1%) |
| Human texts wrongly labelled "Mixed" | 0% |
| AI texts labelled "Likely AI" | 29% |
| AI texts labelled "Likely AI" or "Mixed" | 57% |
| AI texts wrongly labelled "Likely human" | 6.8% |
| Part-AI documents labelled "Mixed" or "Likely AI" | 43% |
| Human-written words highlighted as AI-like | 3.1% |
| AI-written words highlighted as AI-like | 47% |

| Domain | AUROC | Human texts flagged as AI | AI texts flagged "Likely AI" |
|---|---|---|---|
| reddit_eli5 | 0.99 | 0% | 28% |
| medicine | 0.96 | 0% | 19% |
| wiki_csai | 0.96 | 0% | 24% |
| finance | 0.91 | 0% | 15% |
| open_qa | 0.90 | 11% (3 of 28) | 58% |

Sentence settings chosen by `calibrate_sentences.py`: each sentence is scored with its neighbours in a
window of about 96 tokens; a document is "Mixed" when it contains an unbroken run of at least 76 words of
AI-like sentences. That run length was set so that at most 2% of human documents reach it by chance
(`--mixed-fpr 0.02`); 5% would catch 79% of AI texts but would call about 5% of human texts "Mixed".

**What this means:** the scores rank texts well, but the thresholds are deliberately strict, so many AI
texts land in "Uncertain" rather than being flagged. Relaxing the targets catches more AI text at the
cost of more false accusations. A larger model pair on a GPU should improve both. Treat these as early
numbers: the test set is small (3 false positives move the rate by 2 points), and it contains only
GPT-3.5 text.

**Data fix (2026-11-13):** 13% of the HC3 ChatGPT answers contained a literal `\n` instead of line
breaks, and no human answer did. That leaked the label and made AI text look easier to detect (it
inflated "Likely AI" from 29% to 34%). `build_hc3_eval.py` now converts it to real line breaks, and the
numbers above are after the fix. Human texts were unaffected, so the false-positive rate did not change.

## Limitations (read before using results on people)

- No detector is fully reliable. Results are indicators, never proof.
- Short texts, heavily edited AI text and paraphrased ("humanized") AI text are hard to detect.
- Detectors can be biased against non-native English writers. Measure the false-positive rate on such
  text before relying on the tool in education or hiring.
- The HC3 calibration set uses one older model (GPT-3.5). Accuracy on text from newer models must be
  measured with fresh data.

## Roadmap

- **Phase 2:** bigger dataset (RAID, M4, own generations from current models, paraphrase attacks);
  fine-tuned DeBERTa classifier; ensemble with Binoculars; OCR for scanned PDFs.
- **Phase 3:** accounts and server-side history, API keys and rate limits. (Browser-side history, PDF
  reports and batch scanning are done.)
- **Phase 4:** model attribution, more languages, browser extension, LMS / Google Docs integrations.
