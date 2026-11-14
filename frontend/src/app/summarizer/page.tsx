import type { Metadata } from "next";
import Summarizer from "@/components/Summarizer";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Summarizer" };

export default function SummarizerPage() {
  return (
    <>
      <PageHeader
        title="Text summarizer"
        description="Pull out the key sentences of any text, as a paragraph or bullet points. Nothing is reworded, so the summary stays faithful to the source."
      />
      <Summarizer />
    </>
  );
}
