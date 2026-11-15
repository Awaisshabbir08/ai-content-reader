import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "API" };

const ENDPOINTS: { method: string; path: string; what: string }[] = [
  { method: "POST", path: "/api/v1/detect", what: "Analyse a text and wait for the result." },
  { method: "POST", path: "/api/v1/jobs", what: "Queue a text; returns a job id immediately (202)." },
  { method: "GET", path: "/api/v1/jobs/{id}", what: "Job status, progress (0–1), queue position and, when done, the result." },
  { method: "POST", path: "/api/v1/extract", what: "Extract plain text from a .txt, .docx or .pdf upload (multipart, field “file”)." },
  { method: "GET", path: "/api/v1/scans/{id}", what: "Fetch an earlier result by scan id (scores only; text isn’t stored)." },
  {
    method: "POST",
    path: "/api/v1/humanize",
    what: "Rewrite a text so it reads naturally ({text, tone}; tone: natural, casual, professional or academic). Uses a free local model by default, or the Claude API if configured.",
  },
  { method: "GET", path: "/api/v1/info", what: "Detector, limits, thresholds, calibration accuracy and whether the humanizer is set up." },
  { method: "GET", path: "/health", what: "Liveness check; says whether the model is loaded." },
];

const DETECT = `curl -X POST http://localhost:8000/api/v1/detect \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Paste at least 50 words here ..."}'`;

const JOBS = `# 1. queue the text
curl -X POST http://localhost:8000/api/v1/jobs \\
  -H "Content-Type: application/json" \\
  -d '{"text": "..."}'
# -> {"id": "3f2c…", "status": "queued", "progress": 0, "queue_position": 0, ...}

# 2. poll until status is "done" (or "error")
curl http://localhost:8000/api/v1/jobs/3f2c…`;

const PYTHON = `import time, requests

API = "http://localhost:8000"
job = requests.post(f"{API}/api/v1/jobs", json={"text": text}).json()
while job["status"] in ("queued", "running"):
    time.sleep(1)
    job = requests.get(f"{API}/api/v1/jobs/{job['id']}").json()
if job["status"] == "error":
    raise RuntimeError(job["error"])
result = job["result"]
print(result["label"], result["ai_probability"])`;

const EXTRACT = `curl -X POST http://localhost:8000/api/v1/extract -F "file=@essay.pdf"`;

const RESPONSE = `{
  "id": "6d0f8a52-…",
  "label": "likely_ai",            // likely_ai | mixed | uncertain | likely_human
  "ai_probability": 0.93,          // calibrated, 0–1
  "score": 0.7012,                 // Binoculars score, lower = more AI-like
  "thresholds": { "ai_below": 0.796, "human_above": 0.961 },
  "word_count": 172,
  "ai_word_share": 0.81,           // share of analysed words in AI-like sentences
  "longest_ai_run_words": 140,
  "perplexity": 6.9,
  "burstiness": 0.31,
  "possibly_non_english": false,
  "low_reliability": false,        // true under 150 words
  "truncated": false,              // true if only the first part was analysed
  "sentences": [
    { "start": 0, "end": 63, "text": "pH stands for …", "label": "likely_ai",
      "score": 0.712, "perplexity": 5.8 }
  ],
  "detector": { "name": "binoculars:Qwen/Qwen2.5-0.5B|Qwen/Qwen2.5-0.5B-Instruct", "calibrated": true },
  "disclaimer": "AI detection is probabilistic. …"
}`;

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API"
        description="Everything in the web app is available over a JSON API, so you can check texts from your own systems (LMS, CMS, scripts)."
      />

      <Card>
        <h2 className="font-semibold">Endpoints</h2>
        <p className="mt-1 text-sm text-muted">
          Base URL: the backend service (by default <Code>http://localhost:8000</Code>). Interactive documentation with a
          “Try it out” button is at <Code>/docs</Code> on the backend.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.method + e.path} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        e.method === "POST" ? "bg-human-soft" : "bg-subtle"
                      }`}
                    >
                      {e.method}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-[13px]">{e.path}</td>
                  <td className="py-2 text-muted">{e.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Quick start</h2>
          <p className="mt-1 text-sm text-muted">Short texts: one request, one answer.</p>
          <Pre>{DETECT}</Pre>
          <p className="mt-4 text-sm text-muted">
            Long texts or busy servers: use a job and poll it. Requests stay short, and you get progress.
          </p>
          <Pre>{JOBS}</Pre>
        </Card>
        <Card>
          <h2 className="font-semibold">Python</h2>
          <Pre>{PYTHON}</Pre>
          <h2 className="mt-5 font-semibold">Files</h2>
          <p className="mt-1 text-sm text-muted">Extract text from a document, then send the text to detect or jobs.</p>
          <Pre>{EXTRACT}</Pre>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">Response</h2>
        <Pre>{RESPONSE}</Pre>
      </Card>

      <Card>
        <h2 className="font-semibold">Errors and limits</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            <Code>422</Code> fewer than 50 words (or an unreadable file) · <Code>413</Code> over 50,000 characters or 10 MB
            · <Code>415</Code> unsupported file type · <Code>503</Code> model not loaded or queue full.
          </li>
          <li>Texts are analysed up to 2,048 tokens (about 1,500 words); the response says when it was truncated.</li>
          <li>Errors have the shape <Code>{`{"detail": "…"}`}</Code>. Finished jobs and their results are dropped from memory after 10 minutes.</li>
          <li>The API has no authentication. Keep it on a private network or put it behind your gateway.</li>
        </ul>
      </Card>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[13px]">{children}</code>;
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-100">
      {children}
    </pre>
  );
}
