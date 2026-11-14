// Server-side helper for the route handlers that proxy to the FastAPI backend.
// API_URL is read at request time, so the same build works locally (http://localhost:8000)
// and in Docker (http://api:8000).
export async function forwardToBackend(
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: BodyInit;
    contentType?: string;
    timeoutMs: number;
    timeoutDetail?: string;
  },
): Promise<Response> {
  const apiUrl = process.env.API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? "POST",
      headers: init.contentType ? { "Content-Type": init.contentType } : undefined,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return Response.json(
        { detail: init.timeoutDetail ?? "The server took too long to respond. Please try again." },
        { status: 504 },
      );
    }
    return Response.json(
      { detail: "The detection service is not reachable. Is the backend running?" },
      { status: 502 },
    );
  }
}
