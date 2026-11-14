import type { Metadata } from "next";
import { Accuracy, Steps } from "@/components/HowItWorks";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="How the detector works"
        description="What happens to your text, how accurate the detector is, and where it makes mistakes."
      />
      <Steps />
      <section>
        <h2 className="mb-3 text-lg font-semibold">Measured accuracy</h2>
        <Card>
          <Accuracy />
        </Card>
      </section>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Known limitations</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Short texts (under 150 words) give unreliable results; under 50 words are refused.</li>
            <li>Edited or paraphrased AI text often scores as human or uncertain.</li>
            <li>Very formulaic human writing (legal, technical, templates) can look AI-like.</li>
            <li>Calibrated on English only. Other languages get a warning.</li>
            <li>Writing by non-native speakers can be more predictable and score lower.</li>
            <li>Only the first ~1,500 words of a long document are analysed.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Privacy</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>The models run on this server; your text is never sent to a third party.</li>
            <li>The server keeps the scores and a fingerprint (hash) of each text, not the text itself.</li>
            <li>Uploaded files are read in memory and discarded.</li>
            <li>Your scan history is stored only in your own browser and can be cleared at any time.</li>
            <li>The word counter, readability checker, summarizer and citation generator run entirely in your browser.</li>
          </ul>
        </Card>
      </section>
      <Card>
        <h2 className="font-semibold">Use it responsibly</h2>
        <p className="mt-2 text-sm text-muted">
          No AI detector is proof. A “Likely AI” result is a reason to look closer, for example by talking to the
          writer or checking drafts and sources, never a basis on its own for grades, discipline or hiring decisions.
        </p>
      </Card>
    </div>
  );
}
