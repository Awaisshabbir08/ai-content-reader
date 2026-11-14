import type { Metadata } from "next";
import Readability from "@/components/Readability";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Readability & style" };

export default function ReadabilityPage() {
  return (
    <>
      <PageHeader
        title="Readability & style checker"
        description="Six standard readability scores, plus highlights for long sentences, passive voice, adverbs, filler words, wordy phrases and chatbot-style phrasing."
      />
      <Readability />
    </>
  );
}
