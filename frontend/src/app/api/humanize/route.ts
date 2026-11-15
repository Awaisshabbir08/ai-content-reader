import { forwardToBackend } from "@/lib/backend";

// Rewrites a text. The free local model can take a few minutes for a long text on a CPU.
export async function POST(request: Request) {
  return forwardToBackend("/api/v1/humanize", {
    body: await request.text(),
    contentType: "application/json",
    timeoutMs: 610_000, // a little longer than the backend's own 600 s limit
    timeoutDetail: "The rewrite took too long. Please try again, or try a shorter text.",
  });
}
