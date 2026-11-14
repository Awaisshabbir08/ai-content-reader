import Detector from "@/components/Detector";
import { PageHeader } from "@/components/ui";

export default function Home() {
  return (
    <>
      <PageHeader
        title="AI Content Detector"
        description="Find out whether a text was written by AI. Paste text or upload a document; every sentence is highlighted by how AI-like it looks."
      >
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {["Sentence-level highlights", "PDF, Word & text files", "Perplexity & burstiness", "Text is not stored"].map(
            (f) => (
              <li key={f} className="rounded-full border border-border bg-surface px-3 py-1">
                ✓ {f}
              </li>
            ),
          )}
        </ul>
      </PageHeader>
      <Detector />
    </>
  );
}
