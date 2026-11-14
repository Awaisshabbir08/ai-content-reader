"use client";

import { useRef, useState, type DragEvent } from "react";
import Result from "@/components/Result";
import { Alert, Button, Card } from "@/components/ui";
import {
  analyzeDraft,
  cancelAnalysis,
  clearDetector,
  detector,
  editText,
  loadFile,
  loadText,
} from "@/lib/detector-store";
import { SAMPLES, SAMPLES_CREDIT } from "@/lib/samples";
import { draft, useStore } from "@/lib/store";
import { ACCEPTED_FILES, countWords, MAX_CHARS, MIN_WORDS, RELIABLE_WORDS } from "@/lib/types";

export default function Detector() {
  const { text } = useStore(draft);
  const state = useStore(detector);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const words = countWords(text);
  const chars = text.length;
  const analysing = state.phase === "analysing";
  const busy = state.phase !== "idle";
  const tooLong = chars > MAX_CHARS;
  const canSubmit = words >= MIN_WORDS && !busy && !tooLong;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) void loadFile(file);
  }

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Try a sample:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                title={`${s.description} ${SAMPLES_CREDIT}`}
                onClick={() => loadText(s.text, `${s.label} sample`)}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-subtle disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
          <label htmlFor="detector-input" className="sr-only">
            Text to analyse
          </label>
          <textarea
            id="detector-input"
            value={text}
            onChange={(e) => editText(e.target.value)}
            disabled={analysing}
            placeholder={`Paste at least ${MIN_WORDS} words here (${RELIABLE_WORDS}+ for a reliable result), or drop a .txt, .docx or .pdf file…`}
            className={`h-72 w-full resize-y rounded-lg border bg-transparent p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-zinc-400/50 disabled:opacity-70 ${
              dragging ? "border-dashed border-zinc-500 bg-subtle" : "border-border"
            }`}
          />
          {state.fileNote && <p className="mt-2 text-sm text-muted">{state.fileNote}</p>}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className={`text-sm tabular-nums ${tooLong ? "text-rose-700 dark:text-rose-300" : "text-muted"}`}>
              {words.toLocaleString()} words · {chars.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
              {words > 0 && words < MIN_WORDS && ` · ${MIN_WORDS - words} more words needed`}
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_FILES}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow picking the same file again
                  if (file) void loadFile(file);
                }}
              />
              <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                {state.phase === "uploading" ? "Reading file…" : "Upload file"}
              </Button>
              <Button onClick={clearDetector} disabled={!text && !state.shown}>
                Clear
              </Button>
              <Button variant="primary" onClick={() => void analyzeDraft()} disabled={!canSubmit} className="px-6">
                {analysing ? "Analysing…" : "Detect AI"}
              </Button>
            </div>
          </div>
        </div>

        {analysing && (
          <div className="mt-4 rounded-lg border border-border bg-subtle p-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {state.jobStatus === "queued"
                  ? `Waiting for ${state.queuePosition} other scan${state.queuePosition === 1 ? "" : "s"} to finish…`
                  : state.jobStatus === "starting"
                    ? "Starting…"
                    : `Analysing… ${Math.round(state.progress * 100)}%`}
                {state.etaSeconds !== null && (
                  <span className="text-muted"> · about {formatEta(state.etaSeconds)} left</span>
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={cancelAnalysis}>
                Cancel
              </Button>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(state.progress * 100)}
            >
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-500"
                style={{ width: `${Math.max(3, state.progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              The model runs on this server’s CPU: about 5 seconds per 200 words. You can open other tools meanwhile;
              the result will be waiting here.
            </p>
          </div>
        )}
        {state.error && <Alert>{state.error}</Alert>}
      </Card>

      {state.shown && <Result result={state.shown.result} text={state.shown.text} title={state.shown.title} />}
    </div>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
