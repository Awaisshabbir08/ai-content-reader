"use client";

import { useState, type ReactNode } from "react";
import { Button, Card, EmptyHint, TextBox } from "@/components/ui";
import { draft, setDraftText, useStore } from "@/lib/store";
import { checkStyle, ISSUE_INFO, type Issue, type IssueKind } from "@/lib/style-check";
import { easeBand, gradeLabel, readability, textStats } from "@/lib/text-stats";

// Highlight styles per issue type. Each is also named in the legend and on hover.
const MARK: Record<IssueKind, string> = {
  very_long: "bg-rose-200/60 dark:bg-rose-500/25",
  long: "bg-amber-100 dark:bg-amber-500/20",
  passive: "bg-transparent border-b-2 border-sky-500",
  adverb: "bg-transparent border-b-2 border-dotted border-violet-500",
  filler: "bg-zinc-200 line-through decoration-zinc-500/60 dark:bg-zinc-700/60",
  wordy: "bg-fuchsia-100 dark:bg-fuchsia-500/20",
  ai_phrase: "bg-orange-100 border-b-2 border-orange-500 dark:bg-orange-500/20",
};

const ORDER: IssueKind[] = ["very_long", "long", "passive", "adverb", "filler", "wordy", "ai_phrase"];

export default function Readability() {
  const { text } = useStore(draft);
  const [enabled, setEnabled] = useState<Record<IssueKind, boolean>>(
    Object.fromEntries(ORDER.map((k) => [k, true])) as Record<IssueKind, boolean>,
  );
  const r = readability(text);
  const stats = textStats(text);
  const issues = text.trim() ? checkStyle(text) : [];
  const counts = Object.fromEntries(ORDER.map((k) => [k, issues.filter((i) => i.kind === k).length])) as Record<IssueKind, number>;
  const visible = issues.filter((i) => enabled[i.kind]);
  const band = r ? easeBand(r.fleschEase) : null;

  return (
    <div className="space-y-6">
      <Card>
        <TextBox
          value={text}
          onChange={setDraftText}
          rows={9}
          placeholder="Paste your text to get readability scores and style suggestions."
          footer={
            <>
              <span>
                {stats.words.toLocaleString()} words · {stats.sentences.toLocaleString()} sentences
              </span>
              <Button size="sm" onClick={() => setDraftText("")} disabled={!text}>
                Clear
              </Button>
            </>
          }
        />
      </Card>

      {!r ? (
        <Card>
          <EmptyHint>Add at least 10 words to see readability scores.</EmptyHint>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-muted">Flesch reading ease</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{Math.round(Math.max(0, Math.min(100, r.fleschEase)))}</p>
              <p className="mt-1 text-sm font-medium">{band!.label}</p>
              <p className="text-xs text-muted">Easily understood by: {band!.audience}</p>
              <div className="mt-3 h-2 rounded-full bg-human-track">
                <div
                  className="h-full rounded-full bg-human"
                  style={{ width: `${Math.max(2, Math.min(100, r.fleschEase))}%` }}
                />
              </div>
              <p className="mt-1 flex justify-between text-[11px] text-muted">
                <span>Hard</span>
                <span>Easy</span>
              </p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Reading level</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{gradeLabel(r.averageGrade)}</p>
              <p className="mt-1 text-sm">Average of five grade-level formulas</p>
              <p className="text-xs text-muted">Most audiences: aim for grade 8–10.</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Sentences</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{stats.avgSentenceLength.toFixed(1)}</p>
              <p className="mt-1 text-sm">words on average</p>
              <p className="text-xs text-muted">
                {counts.very_long + counts.long} of {stats.sentences} sentences are long (25+ words).
              </p>
            </Card>
          </div>

          <Card>
            <h2 className="font-medium">Readability formulas</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Formula</th>
                    <th className="py-2 pr-3 text-right font-medium">Score</th>
                    <th className="py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <Formula name="Flesch reading ease" value={r.fleschEase} meaning={`${band!.label} (0–100, higher is easier)`} />
                  <Formula name="Flesch–Kincaid grade" value={r.fleschKincaid} meaning={gradeLabel(r.fleschKincaid)} />
                  <Formula name="Gunning fog index" value={r.gunningFog} meaning={gradeLabel(r.gunningFog)} />
                  <Formula name="SMOG index" value={r.smog} meaning={gradeLabel(r.smog)} />
                  <Formula name="Coleman–Liau index" value={r.colemanLiau} meaning={gradeLabel(r.colemanLiau)} />
                  <Formula name="Automated readability index" value={r.ari} meaning={gradeLabel(r.ari)} />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Grade levels follow the US school system. {r.complexWords.toLocaleString()} words have three or more
              syllables. Syllables are estimated, so scores can differ slightly from other tools.
            </p>
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Style suggestions</h2>
              <span className="text-xs text-muted">Click a category to show or hide it</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={enabled[k]}
                  title={ISSUE_INFO[k].help}
                  onClick={() => setEnabled((e) => ({ ...e, [k]: !e[k] }))}
                  className={`inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs ${
                    enabled[k] ? "" : "opacity-45"
                  }`}
                >
                  <span className={`px-1 ${MARK[k]}`}>{ISSUE_INFO[k].label}</span>
                  <span className="font-semibold tabular-nums">{counts[k]}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-8">
              <Marked text={text} issues={visible} />
            </p>
            <p className="mt-3 text-xs text-muted">
              Hover a highlight for details. These are heuristics: use them as prompts to reread, not as rules.
              “Chatbot-style phrases” are common in AI writing but are not evidence of it; use the AI Detector for that.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Formula({ name, value, meaning }: { name: string; value: number; meaning: string }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3">{name}</td>
      <td className="py-2 pr-3 text-right font-medium tabular-nums">{value.toFixed(1)}</td>
      <td className="py-2 text-muted">{meaning}</td>
    </tr>
  );
}

/** Text with sentence-level highlights (long sentences) and inline marks inside them. */
function Marked({ text, issues }: { text: string; issues: Issue[] }) {
  const sentenceMarks = issues.filter((i) => i.kind === "long" || i.kind === "very_long");
  const inline = issues.filter((i) => i.kind !== "long" && i.kind !== "very_long");

  function renderRange(start: number, end: number, keyBase: string): ReactNode[] {
    const out: ReactNode[] = [];
    let cursor = start;
    for (const m of inline) {
      if (m.end <= start || m.start >= end) continue;
      const s = Math.max(m.start, start);
      const e = Math.min(m.end, end);
      if (s > cursor) out.push(text.slice(cursor, s));
      out.push(
        <mark key={`${keyBase}-${s}`} title={`${ISSUE_INFO[m.kind].label}: ${m.message}`} className={`rounded-sm text-inherit ${MARK[m.kind]}`}>
          {text.slice(s, e)}
        </mark>,
      );
      cursor = e;
    }
    if (cursor < end) out.push(text.slice(cursor, end));
    return out;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const s of sentenceMarks) {
    if (s.start > cursor) parts.push(...renderRange(cursor, s.start, `t${cursor}`));
    parts.push(
      <span key={`s${s.start}`} title={`${ISSUE_INFO[s.kind].label}: ${s.message}`} className={`rounded-sm ${MARK[s.kind]}`}>
        {renderRange(s.start, s.end, `s${s.start}`)}
      </span>,
    );
    cursor = s.end;
  }
  if (cursor < text.length) parts.push(...renderRange(cursor, text.length, `t${cursor}`));
  return <>{parts}</>;
}
