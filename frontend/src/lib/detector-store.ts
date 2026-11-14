// State and actions for the AI detector page. Kept in a module store, so an analysis
// keeps running (and its result stays) while the user visits other pages.
import { ApiError, extractFile, runDetection } from "@/lib/api";
import { addToHistory } from "@/lib/history";
import { createStore, draft, setDraftText } from "@/lib/store";
import type { DetectResult } from "@/lib/types";

export interface Shown {
  result: DetectResult;
  text: string;
  title?: string;
}

interface DetectorState {
  filename: string | null;
  fileNote: string | null;
  phase: "idle" | "uploading" | "analysing";
  jobStatus: "starting" | "queued" | "running";
  progress: number; // 0..1
  queuePosition: number;
  etaSeconds: number | null;
  error: string | null;
  shown: Shown | null;
}

export const detector = createStore<DetectorState>({
  filename: null,
  fileNote: null,
  phase: "idle",
  jobStatus: "starting",
  progress: 0,
  queuePosition: 0,
  etaSeconds: null,
  error: null,
  shown: null,
});

let controller: AbortController | null = null;

export async function analyzeDraft(): Promise<void> {
  const text = draft.get().text;
  const title = detector.get().filename ?? undefined;
  controller?.abort();
  const ctrl = (controller = new AbortController());
  detector.set({ phase: "analysing", jobStatus: "starting", progress: 0, queuePosition: 0, etaSeconds: null, error: null });
  let runningSince: number | null = null;
  try {
    const result = await runDetection(text, {
      signal: ctrl.signal,
      onUpdate: (u) => {
        let eta: number | null = null;
        if (u.status === "running") {
          runningSince ??= performance.now();
          const elapsed = (performance.now() - runningSince) / 1000;
          if (u.progress > 0.05 && elapsed > 1) eta = Math.max(1, Math.round((elapsed / u.progress) * (1 - u.progress)));
        }
        detector.set({ jobStatus: u.status, progress: u.progress, queuePosition: u.queuePosition, etaSeconds: eta });
      },
    });
    detector.set({ phase: "idle", progress: 1, shown: { result, text, title } });
    addToHistory(text, result, title);
  } catch (err) {
    if (ctrl.signal.aborted) return; // cancelled, or replaced by a newer run
    detector.set({ phase: "idle", error: err instanceof ApiError ? err.message : "Something went wrong." });
  } finally {
    if (controller === ctrl) controller = null;
  }
}

/** Stop waiting for the current analysis. (The server finishes it, but nobody waits.) */
export function cancelAnalysis(): void {
  controller?.abort();
  controller = null;
  detector.set({ phase: "idle", progress: 0 });
}

export async function loadFile(file: File): Promise<void> {
  detector.set({ phase: "uploading", error: null });
  try {
    const extracted = await extractFile(file);
    setDraftText(extracted.text);
    detector.set({
      phase: "idle",
      filename: extracted.filename,
      shown: null,
      fileNote:
        `Loaded ${extracted.filename} (${extracted.word_count.toLocaleString()} words)` +
        (extracted.truncated ? ". The file was long, so only its beginning was loaded." : "."),
    });
  } catch (err) {
    detector.set({ phase: "idle", error: err instanceof ApiError ? err.message : "Something went wrong." });
  }
}

export function loadText(text: string, label: string | null = null): void {
  setDraftText(text);
  detector.set({ filename: label, fileNote: label ? `Loaded sample: ${label}.` : null, shown: null, error: null });
}

export function editText(text: string): void {
  setDraftText(text);
  if (!text) detector.set({ filename: null, fileNote: null });
}

export function clearDetector(): void {
  cancelAnalysis();
  setDraftText("");
  detector.set({ filename: null, fileNote: null, shown: null, error: null });
}
