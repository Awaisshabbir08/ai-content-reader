"use client";

import { useState, type KeyboardEvent } from "react";
import type { DetectResult, SentenceLabel } from "@/lib/types";

const BAR: Partial<Record<SentenceLabel, string>> = {
  likely_ai: "bg-ai",
  uncertain: "bg-unsure",
  likely_human: "bg-human",
};

export const LABEL_NAME: Record<SentenceLabel, string> = {
  likely_ai: "AI-like",
  uncertain: "Uncertain",
  likely_human: "Human-like",
  too_short: "Too short to score",
  not_analyzed: "Not analysed (text too long)",
};

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v >= 10 ? 0 : 1));

/**
 * Column chart of per-sentence perplexity, coloured by the sentence's label. Hover or
 * focus shows the sentence; clicking a column jumps to it in the text.
 */
export default function SentenceChart({
  result,
  text,
  onPick,
}: {
  result: DetectResult;
  text: string;
  onPick: (sentenceIndex: number) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const chars = Array.from(text);
  const points = result.sentences
    .map((s, index) => ({ index, s, ppl: s.perplexity ?? null }))
    .filter((p): p is typeof p & { ppl: number } => p.ppl !== null);

  if (points.length < 3) return null;

  const values = points.map((p) => p.ppl);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const yMax = niceCeil(Math.max(p95 * 1.1, mean * 1.4));
  const ticks = [0, yMax / 2, yMax];
  const snippet = (start: number, end: number) => {
    const s = chars.slice(start, end).join("");
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  };
  const shown = active === null ? null : points[active];

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? (step > 0 ? -1 : points.length)) + step)));
    } else if (e.key === "Enter" && active !== null) {
      onPick(points[active].index);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Perplexity by sentence</h3>
          <p className="mt-0.5 max-w-xl text-xs text-muted">
            How predictable each sentence is to the language model (lower = more predictable). AI text tends to stay
            evenly low; human writing usually varies more. Click a column to find the sentence.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-subtle print:hidden"
        >
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["likely_ai", "uncertain", "likely_human"] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR[l]}`} />
            {LABEL_NAME[l]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-foreground/60" />
          Average ({fmt(mean)})
        </span>
      </div>

      {asTable ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Sentence</th>
                <th className="py-1.5 pr-2 font-medium">Label</th>
                <th className="py-1.5 text-right font-medium">Perplexity</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.index} className="border-b border-border last:border-0 align-top">
                  <td className="py-1.5 pr-2 tabular-nums text-muted">{p.index + 1}</td>
                  <td className="py-1.5 pr-2">{snippet(p.s.start, p.s.end)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2">{LABEL_NAME[p.s.label]}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(p.ppl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {/* y axis */}
          <div className="relative h-48 w-8 shrink-0 text-right text-[11px] tabular-nums text-muted" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / yMax) * 100}%` }}>
                {fmt(t)}
              </span>
            ))}
          </div>
          {/* plot */}
          <div
            className="relative h-48 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60"
            tabIndex={0}
            role="group"
            aria-label={`Perplexity of ${points.length} sentences. Use the arrow keys to step through them and Enter to find one in the text.`}
            onKeyDown={onKey}
            onMouseLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
          >
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden="true"
                className="absolute inset-x-0 h-px bg-border"
                style={{ top: `${(1 - t / yMax) * 100}%` }}
              />
            ))}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-10 h-px bg-foreground/60"
              style={{ top: `${Math.max(0, 1 - mean / yMax) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {points.map((p, i) => {
                const clipped = p.ppl > yMax;
                return (
                  <button
                    key={p.index}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Sentence ${p.index + 1}: ${LABEL_NAME[p.s.label]}, perplexity ${fmt(p.ppl)}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onPick(p.index)}
                    className="flex h-full min-w-[2px] flex-1 items-end justify-center"
                  >
                    <span
                      className={`relative block w-full max-w-6 rounded-t-[4px] ${BAR[p.s.label] ?? "bg-unsure"} ${
                        active !== null && active !== i ? "opacity-45" : ""
                      }`}
                      style={{ height: `${Math.max(1.5, Math.min(p.ppl / yMax, 1) * 100)}%` }}
                    >
                      {clipped && <span className="absolute inset-x-0 top-2 h-[2px] bg-surface" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {shown && (
              <div
                role="status"
                className="pointer-events-none absolute bottom-full z-20 mb-2 w-64 rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg"
                style={{
                  left: `${((active! + 0.5) / points.length) * 100}%`,
                  transform: `translateX(${active! < points.length / 3 ? "-10%" : active! > (2 * points.length) / 3 ? "-90%" : "-50%"})`,
                }}
              >
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR[shown.s.label] ?? "bg-unsure"}`} />
                    Sentence {shown.index + 1} · {LABEL_NAME[shown.s.label]}
                  </span>
                  <span className="tabular-nums">{fmt(shown.ppl)}</span>
                </div>
                <p className="mt-1 text-muted">{snippet(shown.s.start, shown.s.end)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
