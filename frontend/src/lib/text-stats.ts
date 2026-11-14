// Text statistics and readability formulas. All of this runs in the browser.

export interface Span {
  start: number; // UTF-16 offsets into the text
  end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co",
  "fig", "no", "vol", "approx", "u.s", "u.k",
]);

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

export function wordSpans(text: string): (Span & { word: string })[] {
  return Array.from(text.matchAll(WORD), (m) => ({ start: m.index, end: m.index + m[0].length, word: m[0] }));
}

/** Sentence spans: split after . ! ? … followed by a capital/digit, and at line breaks. */
export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  const boundary = /(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])|\n+/gu;
  let start = 0;
  for (const m of text.matchAll(boundary)) {
    if (!m[0].includes("\n") && endsWithAbbreviation(text.slice(start, m.index))) continue;
    pushTrimmed(spans, text, start, m.index);
    start = m.index + m[0].length;
  }
  pushTrimmed(spans, text, start, text.length);
  return spans.filter((s) => /[\p{L}\p{N}]/u.test(text.slice(s.start, s.end)));
}

function endsWithAbbreviation(chunk: string): boolean {
  const last = chunk.replace(/["'”’)\]]+$/, "").split(/\s+/).pop()?.toLowerCase().replace(/[.!?…]+$/, "");
  return !!last && (ABBREVIATIONS.has(last) || /^\p{L}$/u.test(last));
}

function pushTrimmed(spans: Span[], text: string, start: number, end: number): void {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end > start) spans.push({ start, end });
}

export function paragraphCount(text: string): number {
  return text.split(/\n\s*\n|\r\n\s*\r\n/).filter((p) => p.trim()).length;
}

/** Heuristic English syllable count (accurate to about ±1 per word). */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]).replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by " +
    "can could did do does doing down during each few for from further had has have having he her here hers herself him " +
    "himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other " +
    "our ours ourselves out over own same she should so some such than that the their theirs them themselves then there " +
    "these they this those through to too under until up very was we were what when where which while who whom why will " +
    "with would you your yours yourself yourselves also may might must shall s t don didn doesn isn wasn aren weren won " +
    "can't don't it's i'm you're we're they're that's there's let's one two get got like even much many well back still " +
    "way make made us use used using"
  ).split(" "),
);

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  uniqueWords: number;
  syllables: number;
  avgWordLength: number;
  avgSentenceLength: number;
  longestSentenceWords: number;
  readingMinutes: number;
  speakingMinutes: number;
  lexicalDensity: number; // share of words that are not stop words
  keywords: { word: string; count: number; density: number }[];
  phrases: { phrase: string; count: number }[];
}

export function textStats(text: string): TextStats {
  const ws = words(text);
  const lower = ws.map((w) => w.toLowerCase().replace(/’/g, "'"));
  const sentences = sentenceSpans(text);
  const sentenceWordCounts = sentences.map((s) => words(text.slice(s.start, s.end)).length);
  const letters = ws.reduce((n, w) => n + w.length, 0);

  const counts = new Map<string, number>();
  let content = 0;
  for (const w of lower) {
    if (STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 3) continue;
    content++;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const keywords = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({ word, count, density: ws.length ? count / ws.length : 0 }));

  // Two- and three-word phrases without stop words at either end.
  const phraseCounts = new Map<string, number>();
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= lower.length; i++) {
      const gram = lower.slice(i, i + n);
      if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1]) || gram.some((g) => /^\d+$/.test(g))) continue;
      const key = gram.join(" ");
      phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1);
    }
  }
  const phrases = [...phraseCounts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length)
    .slice(0, 8)
    .map(([phrase, count]) => ({ phrase, count }));

  return {
    words: ws.length,
    characters: Array.from(text).length,
    charactersNoSpaces: Array.from(text.replace(/\s/g, "")).length,
    sentences: sentences.length,
    paragraphs: paragraphCount(text),
    uniqueWords: new Set(lower).size,
    syllables: ws.reduce((n, w) => n + syllables(w), 0),
    avgWordLength: ws.length ? letters / ws.length : 0,
    avgSentenceLength: sentences.length ? ws.length / sentences.length : 0,
    longestSentenceWords: Math.max(0, ...sentenceWordCounts),
    readingMinutes: ws.length / 238, // average silent reading speed for adults
    speakingMinutes: ws.length / 150,
    lexicalDensity: ws.length ? content / ws.length : 0,
    keywords,
    phrases,
  };
}

export interface Readability {
  fleschEase: number;
  fleschKincaid: number;
  gunningFog: number;
  smog: number;
  colemanLiau: number;
  ari: number;
  averageGrade: number;
  complexWords: number;
}

export function readability(text: string): Readability | null {
  const ws = words(text);
  const nSentences = Math.max(1, sentenceSpans(text).length);
  if (ws.length < 10) return null;
  const nWords = ws.length;
  const sylls = ws.map(syllables);
  const nSyll = sylls.reduce((a, b) => a + b, 0);
  const complex = sylls.filter((s) => s >= 3).length;
  const letters = ws.reduce((n, w) => n + w.replace(/[^\p{L}\p{N}]/gu, "").length, 0);

  const wps = nWords / nSentences;
  const spw = nSyll / nWords;
  const fleschEase = 206.835 - 1.015 * wps - 84.6 * spw;
  const fleschKincaid = 0.39 * wps + 11.8 * spw - 15.59;
  const gunningFog = 0.4 * (wps + (100 * complex) / nWords);
  const smog = 1.043 * Math.sqrt(complex * (30 / nSentences)) + 3.1291;
  const colemanLiau = 0.0588 * ((letters / nWords) * 100) - 0.296 * ((nSentences / nWords) * 100) - 15.8;
  const ari = 4.71 * (letters / nWords) + 0.5 * wps - 21.43;
  const grades = [fleschKincaid, gunningFog, smog, colemanLiau, ari];
  return {
    fleschEase,
    fleschKincaid,
    gunningFog,
    smog,
    colemanLiau,
    ari,
    averageGrade: grades.reduce((a, b) => a + b, 0) / grades.length,
    complexWords: complex,
  };
}

/** Plain-language band for a Flesch Reading Ease score. */
export function easeBand(score: number): { label: string; audience: string } {
  if (score >= 90) return { label: "Very easy", audience: "11-year-olds (5th grade)" };
  if (score >= 80) return { label: "Easy", audience: "6th grade" };
  if (score >= 70) return { label: "Fairly easy", audience: "7th grade" };
  if (score >= 60) return { label: "Plain English", audience: "13 to 15-year-olds" };
  if (score >= 50) return { label: "Fairly difficult", audience: "High school (10th–12th grade)" };
  if (score >= 30) return { label: "Difficult", audience: "College students" };
  return { label: "Very difficult", audience: "University graduates" };
}

export function gradeLabel(grade: number): string {
  if (grade < 1) return "Kindergarten";
  if (grade >= 17) return "Graduate";
  if (grade >= 13) return "College";
  return `Grade ${Math.round(grade)}`;
}

export function formatMinutes(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}
