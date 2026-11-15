"use client";

import { useState } from "react";
import { Button, Card, CopyButton, EmptyHint, Segmented, TextBox } from "@/components/ui";
import { draft, setDraftText, useStore } from "@/lib/store";
import { summarize } from "@/lib/summarize";
import { words } from "@/lib/text-stats";

const LENGTHS = [
  { id: "short", label: "Short", ratio: 0.15 },
  { id: "medium", label: "Medium", ratio: 0.3 },
  { id: "long", label: "Long", ratio: 0.5 },
] as const;

export default function Summarizer() {
  const { text } = useStore(draft);
  const [length, setLength] = useState<(typeof LENGTHS)[number]["id"]>("medium");
  const [format, setFormat] = useState<"paragraph" | "bullets">("paragraph");
  const [view, setView] = useState<"summary" | "original">("summary");

  const ratio = LENGTHS.find((l) => l.id === length)!.ratio;
  const all = summarize(text, 1);
  const n = all.sentences.length;
  const count = Math.max(1, Math.min(n, Math.round(n * ratio) || 1));
  const { picked, sentences, keywords } = summarize(text, count);
  const pickedSet = new Set(picked.map((p) => p.index));
  const originalWords = words(text).length;
  const summaryWords = picked.reduce((sum, p) => sum + words(p.text).length, 0);
  const output = format === "bullets" ? picked.map((p) => `• ${p.text}`).join("\n") : picked.map((p) => p.text).join(" ");
  const enough = n >= 3;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-medium">Your text</h2>
        <TextBox
          value={text}
          onChange={setDraftText}
          rows={18}
          placeholder="Paste an article, essay or report (at least three sentences)."
          footer={
            <>
              <span>
                {originalWords.toLocaleString()} words · {n} sentences
              </span>
              <Button size="sm" onClick={() => setDraftText("")} disabled={!text}>
                Clear
              </Button>
            </>
          }
        />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Summary</h2>
          <div className="flex flex-wrap gap-2">
            <Segmented
              label="Length"
              value={length}
              onChange={setLength}
              options={LENGTHS.map((l) => ({ id: l.id, label: l.label }))}
            />
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { id: "paragraph", label: "Paragraph" },
                { id: "bullets", label: "Bullets" },
              ]}
            />
          </div>
        </div>

        {!enough ? (
          <EmptyHint>Paste at least three sentences to get a summary.</EmptyHint>
        ) : (
          <>
            <div className="mt-3 flex gap-1 text-xs" role="tablist" aria-label="View">
              {(["summary", "original"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 ${view === v ? "bg-subtle font-medium" : "text-muted hover:text-foreground"}`}
                >
                  {v === "summary" ? "Summary" : "Highlighted in original"}
                </button>
              ))}
            </div>

            {view === "summary" ? (
              format === "bullets" ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
                  {picked.map((p) => (
                    <li key={p.index}>{p.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[15px] leading-relaxed">{picked.map((p) => p.text).join(" ")}</p>
              )
            ) : (
              <p className="mt-3 max-h-[420px] overflow-auto text-[15px] leading-7">
                {sentences.map((s) => (
                  <span key={s.index} className={pickedSet.has(s.index) ? "rounded-sm bg-human-soft" : "text-muted"}>
                    {s.text}{" "}
                  </span>
                ))}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted">
                {summaryWords.toLocaleString()} words ·{" "}
                {originalWords ? Math.round((1 - summaryWords / originalWords) * 100) : 0}% shorter · {picked.length} of {n}{" "}
                sentences
              </span>
              <CopyButton size="sm" label="Copy summary" getText={() => output} />
            </div>
            {keywords.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted">Key terms</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <li key={k} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-xs text-muted">
          Extractive summary: the most representative sentences are picked with TextRank and kept word for word, so the
          summary never adds anything that isn’t in your text. Runs entirely in your browser.
        </p>
      </Card>
    </div>
  );
}
