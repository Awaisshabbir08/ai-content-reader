"use client";

import { useState, type ReactNode } from "react";
import SentenceChart, { LABEL_NAME } from "@/components/SentenceChart";
import { Button, Card, CopyButton } from "@/components/ui";
import { countWords, RELIABLE_WORDS, type DetectResult, type DocLabel, type SentenceLabel } from "@/lib/types";

export const DOC_LABELS: Record<
  DocLabel,
  { title: string; short: string; headline: string; fill: string; track: string }
> = {
  likely_ai: {
    title: "Likely AI-generated",
    short: "Likely AI",
    headline: "This text is likely AI-generated.",
    fill: "bg-ai",
    track: "bg-ai-track",
  },
  mixed: {
    title: "Mixed: parts look AI-generated",
    short: "Mixed",
    headline: "Parts of this text look AI-generated.",
    fill: "bg-mixed",
    track: "bg-mixed-track",
  },
  uncertain: {
    title: "Uncertain",
    short: "Uncertain",
    headline: "The detector can't tell with confidence.",
    fill: "bg-unsure",
    track: "bg-unsure-track",
  },
  likely_human: {
    title: "Likely human-written",
    short: "Likely human",
    headline: "This text is likely written by a human.",
    fill: "bg-human",
    track: "bg-human-track",
  },
};

const HIGHLIGHT: Partial<Record<SentenceLabel, string>> = {
  likely_ai: "bg-ai-soft border-b-2 border-ai",
  uncertain: "bg-unsure-soft border-b-2 border-dotted border-unsure",
  likely_human: "bg-human-soft",
};

export function VerdictBadge({ label, short = false }: { label: DocLabel; short?: boolean }) {
  const info = DOC_LABELS[label];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 text-sm font-medium">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${info.fill}`} />
      {short ? info.short : info.title}
    </span>
  );
}

export function aiPercent(result: DetectResult): number | null {
  return result.ai_probability === null ? null : Math.round(result.ai_probability * 100);
}

interface Composition {
  ai: number;
  uncertain: number;
  human: number;
  unscored: number;
}

function composition(result: DetectResult, chars: string[]): Composition {
  const c: Composition = { ai: 0, uncertain: 0, human: 0, unscored: 0 };
  for (const s of result.sentences) {
    const n = countWords(chars.slice(s.start, s.end).join(""));
    if (s.label === "likely_ai") c.ai += n;
    else if (s.label === "uncertain") c.uncertain += n;
    else if (s.label === "likely_human") c.human += n;
    else c.unscored += n;
  }
  return c;
}

function summaryText(result: DetectResult, title?: string): string {
  const pct = aiPercent(result);
  return [
    "AI Content Detector result",
    title ? `Document: ${title}` : null,
    `Verdict: ${DOC_LABELS[result.label].title}`,
    pct !== null ? `AI probability: ${pct}%` : null,
    `AI-flagged text: ${Math.round(result.ai_word_share * 100)}% of analysed words`,
    `Words: ${result.word_count}`,
    result.perplexity != null ? `Perplexity: ${result.perplexity}` : null,
    result.burstiness != null ? `Burstiness: ${result.burstiness}` : null,
    `Scan ID: ${result.id}`,
    result.created_at ? `Date: ${new Date(result.created_at).toLocaleString()}` : null,
    "",
    result.disclaimer,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function downloadJson(result: DetectResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ai-detector-${result.id}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Result({ result, text, title }: { result: DetectResult; text: string; title?: string }) {
  const [show, setShow] = useState<Record<"likely_ai" | "uncertain" | "likely_human", boolean>>({
    likely_ai: true,
    uncertain: true,
    likely_human: false,
  });
  const chars = Array.from(text);
  const info = DOC_LABELS[result.label];
  const pct = aiPercent(result);
  const comp = composition(result, chars);
  const scored = comp.ai + comp.uncertain + comp.human;
  const share = (n: number) => (scored ? Math.round((n / scored) * 100) : 0);
  const scoredSentences = result.sentences.filter((s) => s.score !== null).length;

  const warnings = [
    result.low_reliability &&
      `Short text (${result.word_count} words). Results under ${RELIABLE_WORDS} words are less reliable.`,
    result.possibly_non_english &&
      "This text doesn't look like English. The detector is calibrated on English, so treat the result with caution.",
    result.truncated && "The text was long, so only the first part was analysed (greyed out below).",
    !result.detector.calibrated && "The detector is not calibrated for this model pair, so thresholds are placeholders.",
  ].filter(Boolean) as string[];

  function pickSentence(index: number) {
    const el = document.getElementById(`sentence-${index}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation
    el.classList.add("flash");
  }

  return (
    <div className="space-y-6">
      <header className="hidden print:block">
        <h2 className="text-xl font-semibold">AI Content Detector report</h2>
        <p className="mt-1 text-sm text-muted">
          {title ? `${title} · ` : ""}
          {result.created_at ? new Date(result.created_at).toLocaleString() : ""} · Scan {result.id}
        </p>
      </header>

      <Card>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="sm:border-r sm:border-border sm:pr-8">
            <div className="text-5xl font-semibold tabular-nums tracking-tight">{pct === null ? "–" : `${pct}%`}</div>
            <div className="mt-1 text-sm text-muted">AI probability</div>
          </div>
          <div>
            <VerdictBadge label={result.label} />
            <p className="mt-2 text-lg font-medium">{info.headline}</p>
            {pct !== null && (
              <div
                className={`mt-3 h-2.5 w-full overflow-hidden rounded-full ${info.track}`}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="AI probability"
              >
                <div className={`h-full rounded-full ${info.fill}`} style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
            )}
            {result.label === "mixed" && (
              <p className="mt-3 text-sm">
                A passage of about {result.longest_ai_run_words.toLocaleString()} words in a row looks AI-generated,
                although the text as a whole does not. The probability covers the whole text.
              </p>
            )}
          </div>
        </div>

        {scored > 0 && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">What the sentences look like</h3>
              <span className="text-xs text-muted">share of analysed words</span>
            </div>
            <div className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
              {comp.ai > 0 && <div className="bg-ai" style={{ width: `${(comp.ai / scored) * 100}%` }} />}
              {comp.uncertain > 0 && <div className="bg-unsure" style={{ width: `${(comp.uncertain / scored) * 100}%` }} />}
              {comp.human > 0 && <div className="bg-human" style={{ width: `${(comp.human / scored) * 100}%` }} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Key className="bg-ai" name="AI-like" value={`${share(comp.ai)}%`} />
              <Key className="bg-unsure" name="Uncertain" value={`${share(comp.uncertain)}%`} />
              <Key className="bg-human" name="Human-like" value={`${share(comp.human)}%`} />
              {comp.unscored > 0 && (
                <span className="text-xs text-muted self-center">
                  {comp.unscored.toLocaleString()} words in very short sentences not scored
                </span>
              )}
            </div>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Words" value={result.word_count.toLocaleString()} />
          <Tile label="Sentences scored" value={scoredSentences.toLocaleString()} />
          <Tile
            label="Perplexity"
            value={result.perplexity != null ? result.perplexity.toFixed(1) : "–"}
            hint="Lower = more predictable"
          />
          <Tile
            label="Burstiness"
            value={result.burstiness != null ? result.burstiness.toFixed(2) : "–"}
            hint="Higher = more varied"
          />
          <Tile label="Detector score" value={result.score.toFixed(3)} hint={`AI below ${result.thresholds.ai_below.toFixed(3)}`} />
        </dl>

        {warnings.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-amber-800 dark:text-amber-200">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <Button variant="primary" onClick={() => window.print()}>
            Download PDF report
          </Button>
          <CopyButton label="Copy summary" getText={() => summaryText(result, title)} />
          <Button onClick={() => downloadJson(result)}>Export JSON</Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Sentence highlights</h3>
          <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Highlight">
            {(["likely_ai", "uncertain", "likely_human"] as const).map((l) => (
              <label
                key={l}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  className="accent-zinc-700"
                  checked={show[l]}
                  onChange={(e) => setShow((s) => ({ ...s, [l]: e.target.checked }))}
                />
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${HIGHLIGHT[l]}`} />
                {LABEL_NAME[l]}
              </label>
            ))}
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">
          <Highlighted chars={chars} result={result} show={show} />
        </p>
        <p className="mt-3 text-xs text-muted">
          Hover a sentence to see its numbers. Single sentences are judged with their neighbours and are noisier than
          the overall result. Very short sentences are not scored.
        </p>
      </Card>

      <Card className="break-inside-avoid">
        <SentenceChart result={result} text={text} onPick={pickSentence} />
      </Card>

      <details className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm sm:p-5 print:hidden">
        <summary className="cursor-pointer font-medium">How to read this result</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>
            <b className="text-foreground">AI probability</b> is the detector’s calibrated estimate for the whole text. The
            verdict uses stricter cut-offs: “Likely AI” is only given when human texts in our tests were wrongly flagged
            about 1–2% of the time. Between the cut-offs the verdict is “Uncertain”.
          </p>
          <p>
            <b className="text-foreground">Perplexity</b> measures how predictable the words are to a language model. AI
            text is usually very predictable. <b className="text-foreground">Burstiness</b> measures how much that varies
            from sentence to sentence; people tend to mix plain and surprising sentences.
          </p>
          <p>
            Heavily edited AI text, very formal or formulaic human writing, non-native English and short texts are the
            usual sources of mistakes. Use the result as one signal, never as proof.
          </p>
        </div>
      </details>

      <p className="hidden text-xs text-muted print:block">{result.disclaimer}</p>
    </div>
  );
}

function Highlighted({
  chars,
  result,
  show,
}: {
  chars: string[];
  result: DetectResult;
  show: Record<"likely_ai" | "uncertain" | "likely_human", boolean>;
}) {
  // Offsets from the API count Unicode code points, so index into an array of code points.
  const parts: ReactNode[] = [];
  let cursor = 0;
  result.sentences.forEach((s, i) => {
    if (s.start > cursor) parts.push(chars.slice(cursor, s.start).join(""));
    const on = (s.label === "likely_ai" || s.label === "uncertain" || s.label === "likely_human") && show[s.label];
    const tip = [
      LABEL_NAME[s.label],
      s.score !== null ? `score ${s.score.toFixed(3)}` : null,
      s.perplexity != null ? `perplexity ${s.perplexity.toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(
      <span
        key={s.start}
        id={`sentence-${i}`}
        title={tip}
        className={`${on ? HIGHLIGHT[s.label] : ""} ${s.label === "not_analyzed" ? "text-muted" : ""} scroll-mt-24`}
      >
        {chars.slice(s.start, s.end).join("")}
      </span>,
    );
    cursor = s.end;
  });
  if (cursor < chars.length) parts.push(chars.slice(cursor).join(""));
  return <>{parts}</>;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

function Key({ className, name, value }: { className: string; name: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      <span className="text-muted">{name}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}
