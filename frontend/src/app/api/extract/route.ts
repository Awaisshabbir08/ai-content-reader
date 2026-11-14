import { forwardToBackend } from "@/lib/backend";
import { MAX_UPLOAD_MB } from "@/lib/types";

// Proxies file uploads (multipart/form-data) to the backend, which extracts the text.
// The backend enforces the real limit; this check just avoids relaying oversized bodies.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > (MAX_UPLOAD_MB + 1) * 1024 * 1024) {
    return Response.json({ detail: `The file is larger than ${MAX_UPLOAD_MB} MB.` }, { status: 413 });
  }
  return forwardToBackend("/api/v1/extract", {
    body: await request.arrayBuffer(),
    contentType: request.headers.get("content-type") ?? "",
    timeoutMs: 60_000,
  });
}
