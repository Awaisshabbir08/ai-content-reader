// Extractive summary with TextRank (Mihalcea & Tarau, 2004): sentences are ranked by how
// much they share with the rest of the text, and the top ones are kept in their original
// order. Nothing is rewritten, so the summary never says anything the text doesn't.
import { sentenceSpans, STOPWORDS, words, type Span } from "@/lib/text-stats";

export interface RankedSentence extends Span {
  index: number;
  text: string;
  score: number;
}

export interface Summary {
  sentences: RankedSentence[]; // all sentences, in text order, with scores
  picked: RankedSentence[]; // the chosen ones, in text order
  keywords: string[];
}

/** Crude suffix stripping, so "markets", "market" and "marketing" count as one term. */
function stem(word: string): string {
  return word
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/'s$/, "")
    .replace(/(?<=\w{3})ies$/, "y")
    .replace(/(?:ization|isation)$/, "ize")
    .replace(/(?:ational)$/, "ate")
    .replace(/(?:fulness|ousness|iveness)$/, "")
    .replace(/(?:ing|edly|ed|ies|es|s|ly|ment|ness)$/, (m, offset: number) => (offset >= 3 ? "" : m));
}

function terms(sentence: string): string[] {
  return words(sentence)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

export function summarize(text: string, count: number): Summary {
  const spans = sentenceSpans(text);
  const sentences = spans.map((s, index) => ({ ...s, index, text: text.slice(s.start, s.end), score: 0 }));
  const bags = sentences.map((s) => terms(s.text));
  const sets = bags.map((b) => new Set(b));
  const n = sentences.length;

  // Similarity from the TextRank paper: shared terms, normalised by sentence lengths.
  const weights: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sets[i].size < 2 || sets[j].size < 2) continue;
      let shared = 0;
      for (const t of sets[i]) if (sets[j].has(t)) shared++;
      const w = shared / (Math.log(sets[i].size) + Math.log(sets[j].size));
      weights[i][j] = weights[j][i] = w;
    }
  }

  // Weighted PageRank.
  const d = 0.85;
  const outSum = weights.map((row) => row.reduce((a, b) => a + b, 0));
  let scores = new Array<number>(n).fill(1);
  for (let iter = 0; iter < 50; iter++) {
    const next = scores.map((_, i) => {
      let sum = 0;
      for (let j = 0; j < n; j++) if (weights[j][i] > 0 && outSum[j] > 0) sum += (weights[j][i] / outSum[j]) * scores[j];
      return 1 - d + d * sum;
    });
    const delta = next.reduce((m, v, i) => Math.max(m, Math.abs(v - scores[i])), 0);
    scores = next;
    if (delta < 1e-6) break;
  }
  // Very short fragments (headings, "Edit: words.") rarely make good summary sentences.
  sentences.forEach((s, i) => {
    const len = bags[i].length;
    s.score = scores[i] * (len < 4 ? 0.5 : 1);
  });

  const picked = [...sentences]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.min(count, n)))
    .sort((a, b) => a.index - b.index);

  const freq = new Map<string, { count: number; word: string }>();
  for (const w of words(text)) {
    const lw = w.toLowerCase();
    if (lw.length < 4 || STOPWORDS.has(lw) || /^\d+$/.test(lw)) continue;
    const key = stem(lw);
    const entry = freq.get(key) ?? { count: 0, word: lw };
    entry.count++;
    freq.set(key, entry);
  }
  const keywords = [...freq.values()]
    .filter((e) => e.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((e) => e.word);

  return { sentences, picked, keywords };
}
