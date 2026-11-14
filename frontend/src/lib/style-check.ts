// Writing-style checks for the Readability & style tool. Heuristics, like any style
// checker: they point at places worth a second look, they don't prove anything.
import { sentenceSpans, words, type Span } from "@/lib/text-stats";

export type IssueKind = "very_long" | "long" | "passive" | "adverb" | "filler" | "wordy" | "ai_phrase";

export interface Issue extends Span {
  kind: IssueKind;
  message: string;
}

export const ISSUE_INFO: Record<IssueKind, { label: string; help: string }> = {
  very_long: { label: "Very long sentence", help: "35+ words. Consider splitting it." },
  long: { label: "Long sentence", help: "25–34 words. Harder to follow." },
  passive: { label: "Passive voice", help: "“was written by” → “X wrote”. Active voice is usually clearer." },
  adverb: { label: "Adverb", help: "Words ending in -ly. A stronger verb often works better." },
  filler: { label: "Filler word", help: "Words like “very” or “really” that rarely add meaning." },
  wordy: { label: "Wordy phrase", help: "There is a shorter way to say this." },
  ai_phrase: {
    label: "Chatbot-style phrase",
    help: "Phrases chatbots overuse. People use them too, so this is a style hint, not evidence of AI.",
  },
};

const IRREGULAR_PARTICIPLES =
  "awoken been born beaten become begun bent bet bitten blown broken brought built burnt bought caught chosen come " +
  "cost cut dealt done drawn dreamt driven drunk eaten fallen fed felt fought found flown forbidden forgotten forgiven " +
  "frozen given gone ground grown hung heard hidden hit held hurt kept known laid led left lent let lain lit lost made " +
  "meant met paid put quit read ridden rung risen run said seen sought sold sent set shaken shed shot shown shut sung " +
  "sunk sat slept slid spoken spent spun spread stood stolen stuck stung struck sworn swept swum taken taught torn told " +
  "thought thrown understood woken worn woven won written";

const PASSIVE = new RegExp(
  String.raw`\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|${IRREGULAR_PARTICIPLES.split(" ").join("|")})\b`,
  "gi",
);

// -ly words that aren't adverbs (or are too common to be worth flagging).
const NOT_ADVERBS = new Set(
  (
    "only early family reply apply supply daily italy july fly ally rely belly bully jelly ugly silly holy imply " +
    "multiply anomaly assembly monopoly butterfly lovely friendly likely unlikely lonely costly elderly curly " +
    "chilly hilly oily scholarly orderly timely weekly monthly yearly quarterly hourly nightly comply rally tally " +
    "folly melancholy homily lily emily kelly molly sally billy willy reilly ely bradley stanley beverly"
  ).split(" "),
);

const FILLERS = [
  "very", "really", "just", "quite", "actually", "basically", "literally", "totally", "simply", "somewhat",
  "rather", "extremely", "definitely", "certainly", "truly", "absolutely", "essentially",
];

const WORDY: [string, string][] = [
  ["in order to", "to"],
  ["due to the fact that", "because"],
  ["owing to the fact that", "because"],
  ["in spite of the fact that", "although"],
  ["despite the fact that", "although"],
  ["at this point in time", "now"],
  ["at the present time", "now"],
  ["a large number of", "many"],
  ["a majority of", "most"],
  ["in the event that", "if"],
  ["has the ability to", "can"],
  ["have the ability to", "can"],
  ["is able to", "can"],
  ["are able to", "can"],
  ["with regard to", "about"],
  ["with respect to", "about"],
  ["in regard to", "about"],
  ["for the purpose of", "to / for"],
  ["in the near future", "soon"],
  ["prior to", "before"],
  ["subsequent to", "after"],
  ["utilize", "use"],
  ["utilise", "use"],
  ["utilization", "use"],
  ["commence", "begin"],
  ["facilitate", "help"],
  ["approximately", "about"],
  ["numerous", "many"],
  ["sufficient", "enough"],
  ["endeavor", "try"],
  ["endeavour", "try"],
  ["demonstrate", "show"],
  ["terminate", "end"],
  ["purchase", "buy"],
  ["assist", "help"],
  ["additional", "more / extra"],
  ["each and every", "each / every"],
  ["first and foremost", "first"],
];

const AI_PHRASES = [
  "delve", "delves", "delving", "tapestry", "testament to", "it's important to note", "it is important to note",
  "it's worth noting", "it is worth noting", "in today's fast-paced world", "in today's digital age",
  "in the ever-evolving", "ever-evolving", "navigate the complexities", "navigating the complexities",
  "in the realm of", "the realm of", "a myriad of", "plethora", "unlock the potential", "unleash the power",
  "embark on a journey", "game-changer", "game changer", "seamlessly", "seamless", "leverage", "leveraging",
  "pivotal", "foster", "fostering", "underscore", "underscores", "holistic", "multifaceted", "nuanced",
  "intricate", "intricacies", "landscape of", "paramount", "meticulous", "meticulously", "bustling",
  "vibrant", "elevate", "streamline", "harness", "in conclusion", "in summary", "to sum up", "overall,",
  "furthermore", "moreover", "additionally", "i hope this helps", "i hope that helps",
  "let me know if you have any other questions", "as an ai language model", "great question",
  "it's crucial to", "it is crucial to", "it's essential to", "it is essential to", "plays a crucial role",
  "plays a vital role", "a crucial role", "a vital role", "rich tapestry",
];

function phraseRegex(phrases: string[]): RegExp {
  const sorted = [...phrases].sort((a, b) => b.length - a.length); // longest first
  const body = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")).join("|");
  return new RegExp(String.raw`(?<![\p{L}])(?:${body})(?![\p{L}])`, "giu");
}

const FILLER_RE = phraseRegex(FILLERS);
const AI_RE = phraseRegex(AI_PHRASES);
const WORDY_RE = phraseRegex(WORDY.map(([w]) => w));
const WORDY_MAP = new Map(WORDY.map(([w, s]) => [w, s]));

export function checkStyle(text: string): Issue[] {
  const issues: Issue[] = [];

  for (const s of sentenceSpans(text)) {
    const n = words(text.slice(s.start, s.end)).length;
    if (n >= 35) issues.push({ ...s, kind: "very_long", message: `${n} words. Consider splitting this sentence.` });
    else if (n >= 25) issues.push({ ...s, kind: "long", message: `${n} words. A little hard to follow.` });
  }

  for (const m of text.matchAll(PASSIVE)) {
    issues.push({ start: m.index, end: m.index + m[0].length, kind: "passive", message: `Passive voice: “${m[0]}”.` });
  }

  for (const m of text.matchAll(/\b[\p{L}]+ly\b/gu)) {
    const w = m[0].toLowerCase();
    if (w.length <= 4 || NOT_ADVERBS.has(w)) continue;
    issues.push({ start: m.index, end: m.index + m[0].length, kind: "adverb", message: `Adverb: “${m[0]}”.` });
  }

  for (const m of text.matchAll(FILLER_RE)) {
    issues.push({ start: m.index, end: m.index + m[0].length, kind: "filler", message: `“${m[0]}” can often be cut.` });
  }

  for (const m of text.matchAll(WORDY_RE)) {
    const simpler = WORDY_MAP.get(m[0].toLowerCase().replace(/’/g, "'"));
    issues.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "wordy",
      message: simpler ? `“${m[0]}” → “${simpler}”` : `“${m[0]}” is wordy.`,
    });
  }

  for (const m of text.matchAll(AI_RE)) {
    issues.push({
      start: m.index,
      end: m.index + m[0].replace(/,$/, "").length,
      kind: "ai_phrase",
      message: `“${m[0].replace(/,$/, "")}” is common in chatbot writing.`,
    });
  }

  // Inline marks must not overlap each other (sentence-length marks are drawn separately).
  // Adverbs and fillers inside a wordy or chatbot phrase are dropped.
  const inline = issues
    .filter((i) => i.kind !== "long" && i.kind !== "very_long")
    .sort((a, b) => a.start - b.start || rank(a.kind) - rank(b.kind));
  const kept: Issue[] = [];
  for (const i of inline) {
    const last = kept[kept.length - 1];
    if (last && i.start < last.end) continue;
    kept.push(i);
  }
  return [...issues.filter((i) => i.kind === "long" || i.kind === "very_long"), ...kept];
}

function rank(kind: IssueKind): number {
  return ["ai_phrase", "wordy", "passive", "filler", "adverb"].indexOf(kind);
}
