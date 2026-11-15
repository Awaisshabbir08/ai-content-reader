// State and actions for the humanizer page. Kept in a module store, so a rewrite keeps
// running (and its result stays) while the user visits other pages.
import { ApiError, humanizeText, runDetection } from "@/lib/api";
import { detector, loadText } from "@/lib/detector-store";
import { createStore, draft } from "@/lib/store";
import { countWords, MIN_WORDS, type DetectResult, type HumanizeResult, type HumanizeTone } from "@/lib/types";

export const TONES: { id: HumanizeTone; label: string }[] = [
  { id: "natural", label: "Natural" },
  { id: "casual", label: "Casual" },
  { id: "professional", label: "Professional" },
  { id: "academic", label: "Academic" },
];

interface HumanizerState {
  tone: HumanizeTone;
  phase: "idle" | "rewriting" | "checking";
  startedAt: number | null; // Date.now() when the rewrite started, for the elapsed-time counter
  error: string | null;
  output: (HumanizeResult & { source: string }) | null;
  before: DetectResult | null; // detector result for the original text
  after: DetectResult | null; // detector result for the rewrite
  checkError: string | null;
}

export const humanizer = createStore<HumanizerState>({
  tone: "natural",
  phase: "idle",
  startedAt: null,
  error: null,
  output: null,
  before: null,
  after: null,
  checkError: null,
});

let controller: AbortController | null = null;

export function setTone(tone: HumanizeTone): void {
  humanizer.set({ tone });
}

/** Rewrite the shared draft, then score the original and the rewrite with the detector. */
export async function humanizeDraft(): Promise<void> {
  const source = draft.get().text;
  controller?.abort();
  const ctrl = (controller = new AbortController());
  humanizer.set({
    phase: "rewriting",
    startedAt: Date.now(),
    error: null,
    output: null,
    before: null,
    after: null,
    checkError: null,
  });
  try {
    const output = await humanizeText(source, humanizer.get().tone, ctrl.signal);
    humanizer.set({ phase: "checking", output: { ...output, source } });
    await compareScores(source, output.text, ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) return; // cancelled, or replaced by a newer run
    humanizer.set({ error: err instanceof ApiError ? err.message : "Something went wrong." });
  } finally {
    if (controller === ctrl) {
      controller = null;
      humanizer.set({ phase: "idle", startedAt: null });
    }
  }
}

async function compareScores(source: string, rewrite: string, signal: AbortSignal): Promise<void> {
  if (countWords(source) < MIN_WORDS || countWords(rewrite) < MIN_WORDS) {
    humanizer.set({ checkError: `The detector needs at least ${MIN_WORDS} words to compare scores.` });
    return;
  }
  try {
    // The rewrite's score matters most, so it goes first. The original's score is reused
    // from the detector page when that page has just analysed the same text.
    const after = await runDetection(rewrite, { signal });
    humanizer.set({ after });
    const shown = detector.get().shown;
    const before = shown?.text === source ? shown.result : await runDetection(source, { signal });
    humanizer.set({ before });
  } catch (err) {
    if (signal.aborted) throw err;
    humanizer.set({
      checkError: `The rewrite is ready, but the detector check failed: ${
        err instanceof ApiError ? err.message : "something went wrong."
      }`,
    });
  }
}

/** Stop waiting for the current rewrite. */
export function cancelHumanize(): void {
  controller?.abort();
  controller = null;
  humanizer.set({ phase: "idle", startedAt: null });
}

/** Put the rewrite into the shared text box, ready for the other tools. */
export function moveRewriteToDraft(): void {
  const { output } = humanizer.get();
  if (output) loadText(output.text);
}

/** Open the rewrite's full detector report (sentence highlights) on the detector page. */
export function openRewriteReport(): void {
  const { output, after } = humanizer.get();
  if (!output || !after) return;
  loadText(output.text);
  detector.set({ shown: { result: after, text: output.text, title: "Humanized text" } });
}
