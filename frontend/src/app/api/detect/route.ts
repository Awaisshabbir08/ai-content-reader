import { forwardToBackend } from "@/lib/backend";

// Synchronous detection, kept for API clients. The web UI uses /api/jobs, which reports
// progress and never holds a request open for long. On a CPU-only server a long text can
// take a minute or more, so the limit here is generous.
export async function POST(request: Request) {
  return forwardToBackend("/api/v1/detect", {
    body: await request.text(),
    contentType: "application/json",
    timeoutMs: Number(process.env.DETECT_TIMEOUT_MS) || 300_000,
    timeoutDetail: "The analysis took too long. The server may be busy; try again, or try a shorter text.",
  });
}
