import { forwardToBackend } from "@/lib/backend";

// Queues a text for analysis; the browser then polls /api/jobs/{id}.
export async function POST(request: Request) {
  return forwardToBackend("/api/v1/jobs", {
    body: await request.text(),
    contentType: "application/json",
    timeoutMs: 30_000,
  });
}
