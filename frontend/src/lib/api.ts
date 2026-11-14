// Browser-side calls to this app's route handlers (which proxy to the backend).
import {
  MAX_UPLOAD_MB,
  type DetectorInfo,
  type DetectResult,
  type ExtractResult,
  type JobStatus,
} from "@/lib/types";

export class ApiError extends Error {}

export async function extractFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new ApiError(`The file is larger than ${MAX_UPLOAD_MB} MB.`);
  }
  const form = new FormData();
  form.append("file", file);
  return request<ExtractResult>("/api/extract", { method: "POST", body: form });
}

export async function fetchInfo(): Promise<DetectorInfo> {
  return request<DetectorInfo>("/api/info", { method: "GET" });
}

export interface JobUpdate {
  status: "queued" | "running";
  progress: number; // 0..1
  queuePosition: number;
}

/**
 * Analyse a text as a background job and poll until it finishes. Polling keeps every
 * request short, so a long analysis can't hit a proxy timeout, and a brief network drop
 * (e.g. the laptop waking from sleep) is retried instead of failing the scan.
 */
export async function runDetection(
  text: string,
  { onUpdate, signal }: { onUpdate?: (u: JobUpdate) => void; signal?: AbortSignal } = {},
): Promise<DetectResult> {
  let job = await request<JobStatus>("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  let failures = 0;
  for (;;) {
    if (job.status === "done" && job.result) return job.result;
    if (job.status === "error") throw new ApiError(job.error ?? "The analysis failed.");
    if (job.status === "queued" || job.status === "running") {
      onUpdate?.({ status: job.status, progress: job.progress, queuePosition: job.queue_position });
    }
    await sleep(job.status === "queued" ? 1200 : 700, signal);
    try {
      job = await request<JobStatus>(`/api/jobs/${encodeURIComponent(job.id)}`, { method: "GET", signal });
      failures = 0;
    } catch (err) {
      if (signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("Job not found")) {
        throw new ApiError("The server restarted before the analysis finished. Please run it again.");
      }
      if (++failures >= 8) throw err; // about 20 s of failed polls
      await sleep(Math.min(500 * 2 ** failures, 5000), signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ApiError("Could not reach the server.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(errorMessage(body, res.status));
  return body as T;
}

function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return `Request failed (${status}).`;
}
