"use client";

import { useRef, useState, type DragEvent } from "react";
import Result, { aiPercent, VerdictBadge } from "@/components/Result";
import { Button, Card } from "@/components/ui";
import {
  addFiles,
  batch,
  clearBatch,
  downloadCsv,
  isRunning,
  MAX_FILES,
  type BatchStatus,
} from "@/lib/batch-store";
import { useStore } from "@/lib/store";
import { ACCEPTED_FILES, MIN_WORDS } from "@/lib/types";

const STATUS_TEXT: Record<BatchStatus, string> = {
  waiting: "Waiting…",
  reading: "Reading file…",
  queued: "In queue…",
  analysing: "Analysing…",
  done: "",
  too_short: `Too short (needs ${MIN_WORDS}+ words)`,
  error: "",
};

export default function Batch() {
  const { items, notice } = useStore(batch);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const running = isRunning(items);
  const finished = items.filter((i) => i.status === "done");
  const shown = items.find((i) => i.key === selected && i.result);
  const flagged = finished.filter((i) => i.result!.label === "likely_ai" || i.result!.label === "mixed").length;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
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
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-12 text-center ${
            dragging ? "border-zinc-500 bg-subtle" : "border-border"
          }`}
        >
          <p className="text-[15px] font-medium">Drop up to {MAX_FILES} files here</p>
          <p className="text-sm text-muted">.txt, .docx or .pdf · up to 10 MB each</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              addFiles(files);
            }}
          />
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={items.length >= MAX_FILES}>
            Choose files
          </Button>
        </div>
        {notice && <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{notice}</p>}

        {items.length > 0 && (
          <>
            {finished.length > 0 && (
              <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Summary label="Analysed" value={`${finished.length} of ${items.length}`} />
                <Summary label="Likely AI or mixed" value={String(flagged)} />
                <Summary label="Likely human or uncertain" value={String(finished.length - flagged)} />
              </dl>
            )}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 text-right font-medium">Words</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 pr-3 text-right font-medium">AI probability</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const pct = i.result ? aiPercent(i.result) : null;
                    return (
                      <tr
                        key={i.key}
                        className={`border-b border-border last:border-0 ${selected === i.key ? "bg-subtle" : ""}`}
                      >
                        <td className="max-w-[260px] truncate py-2.5 pr-3" title={i.name}>
                          {i.name}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{i.words?.toLocaleString() ?? "–"}</td>
                        <td className="py-2.5 pr-3">
                          {i.result ? (
                            <VerdictBadge label={i.result.label} short />
                          ) : (
                            <span className={i.status === "error" ? "text-rose-700 dark:text-rose-300" : "text-muted"}>
                              {i.error ?? STATUS_TEXT[i.status]}
                              {i.status === "analysing" && ` ${Math.round(i.progress * 100)}%`}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{pct === null ? "–" : `${pct}%`}</td>
                        <td className="py-2.5 text-right">
                          {i.result && (
                            <Button size="sm" onClick={() => setSelected(i.key)}>
                              View
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted">
                {running ? "Files are analysed one after another. You can open other pages meanwhile." : "Done."}
              </span>
              <div className="flex gap-2">
                <Button onClick={() => downloadCsv(items)} disabled={finished.length === 0}>
                  Download CSV
                </Button>
                <Button
                  onClick={() => {
                    clearBatch();
                    setSelected(null);
                  }}
                  disabled={running}
                >
                  Clear list
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {shown?.result && <Result result={shown.result} text={shown.text ?? ""} title={shown.name} />}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
