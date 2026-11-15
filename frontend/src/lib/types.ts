export type DocLabel = "likely_ai" | "mixed" | "uncertain" | "likely_human";
export type SentenceLabel = "likely_ai" | "uncertain" | "likely_human" | "too_short" | "not_analyzed";

export interface Sentence {
  start: number; // code-point offsets into the submitted text
  end: number;
  text: string | null;
  score: number | null;
  label: SentenceLabel;
  perplexity?: number | null;
}

export interface DetectResult {
  id: string;
  created_at: string | null;
  label: DocLabel;
  ai_probability: number | null;
  score: number;
  thresholds: { ai_below: number; human_above: number };
  word_count: number;
  token_count: number;
  truncated: boolean;
  low_reliability: boolean;
  ai_word_share: number;
  longest_ai_run_words: number;
  perplexity?: number | null; // older saved results don't have these three
  burstiness?: number | null;
  possibly_non_english?: boolean;
  sentences: Sentence[];
  detector: { name: string; calibrated: boolean };
  disclaimer: string;
}

export interface JobStatus {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  queue_position: number;
  result: DetectResult | null;
  error: string | null;
  error_status: number | null;
}

export interface ExtractResult {
  text: string;
  filename: string;
  file_type: "txt" | "docx" | "pdf";
  word_count: number;
  truncated: boolean;
}

export interface SplitMetrics {
  n_ai: number;
  n_human: number;
  auroc: number;
  tpr: number;
  fpr: number;
  human_recall: number;
  ai_called_human: number;
  uncertain: number;
}

export interface DetectorInfo {
  detector: string | null;
  model_loaded: boolean;
  calibrated: boolean;
  thresholds: { ai_below: number; human_above: number };
  mixed_detection: boolean;
  min_words: number;
  reliable_words: number;
  max_chars: number;
  max_tokens: number;
  max_upload_mb: number;
  humanizer?: HumanizerInfo; // missing on an older backend
  calibration: {
    document: {
      created?: string;
      dataset?: string;
      target_fpr?: number;
      target_fnr?: number;
      metrics?: { calib?: SplitMetrics; test?: SplitMetrics };
      test_by_domain?: Record<string, Omit<SplitMetrics, "n_ai" | "n_human">>;
    };
    sentences: {
      metrics?: {
        test?: {
          docs_human: VerdictShares;
          docs_ai: VerdictShares;
          docs_mixed: VerdictShares;
          sentences_pure: { human_words_flagged_ai: number; ai_words_flagged_ai: number };
        };
      };
    };
  };
}

export type HumanizeTone = "natural" | "casual" | "professional" | "academic";

export interface HumanizerInfo {
  enabled: boolean; // true when the engine is ready to rewrite
  engine: string; // "local" (free model via Ollama), "claude" (paid API) or "off"
  model: string | null;
  problem: string | null; // why it isn't ready, in plain words
  min_words: number;
  max_words: number;
  tones: HumanizeTone[];
}

export interface HumanizeResult {
  text: string;
  tone: HumanizeTone;
  model: string;
  word_count: number;
}

export interface VerdictShares {
  likely_human: number;
  uncertain: number;
  mixed: number;
  likely_ai: number;
  n: number;
}

export const MIN_WORDS = 50;
export const RELIABLE_WORDS = 150;
export const MAX_CHARS = 50_000;
export const MAX_UPLOAD_MB = 10;
export const ACCEPTED_FILES = ".txt,.docx,.pdf";

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
}
