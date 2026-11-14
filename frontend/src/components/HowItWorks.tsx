"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { fetchInfo } from "@/lib/api";
import type { DetectorInfo } from "@/lib/types";

const pct = (v: number | undefined) => (v === undefined ? "–" : `${(v * 100).toFixed(1)}%`);

const DOMAIN_NAMES: Record<string, string> = {
  finance: "Finance Q&A",
  medicine: "Medical Q&A",
  open_qa: "Open questions",
  reddit_eli5: "Reddit “Explain like I’m 5”",
  wiki_csai: "Wikipedia-style (CS/AI)",
};

/** Accuracy figures measured during calibration, read live from the backend. */
export function Accuracy() {
  const [info, setInfo] = useState<DetectorInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-sm text-muted">Accuracy figures are unavailable: the backend is not reachable.</p>;
  if (!info) return <p className="text-sm text-muted">Loading accuracy figures…</p>;

  const doc = info.calibration.document;
  const test = doc.metrics?.test;
  if (!info.calibrated || !test) {
    return <p className="text-sm text-muted">The detector has not been calibrated yet, so there are no measured figures.</p>;
  }
  const domains = Object.entries(doc.test_by_domain ?? {});
  // End-to-end figures (with the "Mixed" verdict) when sentence calibration exists.
  const e2e = info.mixed_detection ? info.calibration.sentences.metrics?.test : undefined;

  return (
    <div className="space-y-4">
      {e2e ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Fig label="Ranking quality (AUROC)" value={test.auroc.toFixed(2)} hint="1.0 = perfect, 0.5 = guessing" />
          <Fig
            label="Human texts wrongly flagged"
            value={pct(e2e.docs_human.likely_ai + e2e.docs_human.mixed)}
            hint="As “Likely AI” or “Mixed”"
          />
          <Fig
            label="AI texts flagged"
            value={pct(e2e.docs_ai.likely_ai + e2e.docs_ai.mixed)}
            hint={`${pct(e2e.docs_ai.likely_ai)} “Likely AI”, the rest “Mixed”`}
          />
          <Fig
            label="Part-AI documents caught"
            value={pct(e2e.docs_mixed.likely_ai + e2e.docs_mixed.mixed)}
            hint={`Of ${e2e.docs_mixed.n} human + AI documents`}
          />
          <Fig label="AI texts called “Likely human”" value={pct(e2e.docs_ai.likely_human)} hint="Missed outright" />
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fig label="Ranking quality (AUROC)" value={test.auroc.toFixed(2)} hint="1.0 = perfect, 0.5 = guessing" />
          <Fig label="Human texts wrongly flagged as AI" value={pct(test.fpr)} hint="False positives" />
          <Fig label="AI texts flagged as “Likely AI”" value={pct(test.tpr)} hint="The rest are mostly “Uncertain”" />
          <Fig label="AI texts called “Likely human”" value={pct(test.ai_called_human)} hint="Missed outright" />
        </dl>
      )}
      <p className="text-sm text-muted">
        Measured on {test.n_human} human and {test.n_ai} ChatGPT answers held out from calibration (dataset: HC3,
        {doc.created ? ` calibrated ${doc.created}` : ""}). The detector is deliberately cautious: when unsure it
        answers “Uncertain” rather than risk wrongly accusing a human.
        {e2e &&
          ` In sentence highlights, ${pct(e2e.sentences_pure.human_words_flagged_ai)} of human-written words were marked AI-like.`}
      </p>
      <p className="text-xs text-muted">The table below covers the whole-text verdict (without “Mixed”), by kind of text.</p>
      {domains.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Kind of text</th>
                <th className="py-2 pr-3 text-right font-medium">AUROC</th>
                <th className="py-2 pr-3 text-right font-medium">Humans flagged</th>
                <th className="py-2 pr-3 text-right font-medium">AI flagged</th>
                <th className="py-2 text-right font-medium">Uncertain</th>
              </tr>
            </thead>
            <tbody>
              {domains.map(([name, m]) => (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{DOMAIN_NAMES[name] ?? name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.auroc.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(m.fpr)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(m.tpr)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(m.uncertain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Detector: {info.detector ?? "not loaded"} · thresholds: AI below {info.thresholds.ai_below.toFixed(3)}, human above{" "}
        {info.thresholds.human_above.toFixed(3)} · mixed-text detection {info.mixed_detection ? "on" : "not calibrated yet"}
      </p>
    </div>
  );
}

function Fig({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-[11px] text-muted">{hint}</dd>
    </div>
  );
}

export function Steps() {
  const steps = [
    {
      title: "Two language models read the text",
      body: "A base model and its chat-tuned sibling (Qwen2.5, run on this server) each predict every next word. Nothing is sent to an outside service.",
    },
    {
      title: "Surprise is compared with expected surprise",
      body: "The Binoculars method divides how surprising the text is to one model (perplexity) by how surprising the two models find each other’s predictions. AI text scores low; human text scores high. This cancels out topics that are simply hard or easy.",
    },
    {
      title: "Calibrated thresholds turn the score into a verdict",
      body: "Cut-offs were set on labelled human and AI texts so that human writing is rarely flagged. Between the cut-offs the verdict is “Uncertain”. A calibrated probability is shown alongside.",
    },
    {
      title: "Sentences are scored in context",
      body: "Each sentence is scored together with its neighbours to reduce noise, and highlighted. A long run of AI-like sentences in an otherwise human text gives the “Mixed” verdict.",
    },
  ];
  return (
    <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.title}>
          <Card className="h-full">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-subtle text-sm font-semibold">{i + 1}</span>
            <h3 className="mt-3 font-medium">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
