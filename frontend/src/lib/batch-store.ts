// Batch file checks. Files are processed one after another; the queue lives in a module
// store, so it keeps running while the user visits other pages.
import { ApiError, extractFile, runDetection } from "@/lib/api";
import { addToHistory } from "@/lib/history";
import { createStore } from "@/lib/store";
import { MIN_WORDS, type DetectResult } from "@/lib/types";

export const MAX_FILES = 20;

export type BatchStatus = "waiting" | "reading" | "queued" | "analysing" | "done" | "too_short" | "error";

export interface BatchItem {
  key: number;
  name: string;
  status: BatchStatus;
  progress: number;
  words?: number;
  text?: string;
  result?: DetectResult;
  error?: string;
}

export const batch = createStore<{ items: BatchItem[]; notice: string | null }>({ items: [], notice: null });

let nextKey = 1;
let chain: Promise<void> = Promise.resolve();

function update(key: number, patch: Partial<BatchItem>): void {
  batch.set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
}

async function processOne(key: number, file: File): Promise<void> {
  if (!batch.get().items.some((i) => i.key === key)) return; // list was cleared
  update(key, { status: "reading" });
  try {
    const extracted = await extractFile(file);
    if (extracted.word_count < MIN_WORDS) {
      update(key, { status: "too_short", words: extracted.word_count });
      return;
    }
    update(key, { status: "queued", words: extracted.word_count });
    const result = await runDetection(extracted.text, {
      onUpdate: (u) => update(key, { status: u.status === "running" ? "analysing" : "queued", progress: u.progress }),
    });
    update(key, { status: "done", progress: 1, text: extracted.text, result });
    addToHistory(extracted.text, result, extracted.filename);
  } catch (err) {
    update(key, { status: "error", error: err instanceof ApiError ? err.message : "Something went wrong." });
  }
}

export function addFiles(files: File[]): void {
  const { items } = batch.get();
  const room = MAX_FILES - items.length;
  const accepted = files.slice(0, Math.max(room, 0));
  const added: BatchItem[] = accepted.map((f) => ({ key: nextKey++, name: f.name, status: "waiting", progress: 0 }));
  batch.set({
    items: [...items, ...added],
    notice: files.length > room ? `Only ${MAX_FILES} files per batch; the rest were skipped.` : null,
  });
  accepted.forEach((file, i) => {
    chain = chain.then(() => processOne(added[i].key, file));
  });
}

export function isRunning(items: BatchItem[]): boolean {
  return items.some((i) => ["waiting", "reading", "queued", "analysing"].includes(i.status));
}

export function clearBatch(): void {
  batch.set({ items: [], notice: null });
}

export function downloadCsv(items: BatchItem[]): void {
  const header = ["file", "words", "verdict", "ai_probability", "ai_flagged_word_share", "perplexity", "burstiness", "score", "scan_id"];
  const rows = items
    .filter((i) => i.result)
    .map((i) => {
      const r = i.result!;
      return [i.name, r.word_count, r.label, r.ai_probability ?? "", r.ai_word_share, r.perplexity ?? "", r.burstiness ?? "", r.score, r.id];
    });
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "ai-detector-batch.csv" });
  a.click();
  URL.revokeObjectURL(url);
}
