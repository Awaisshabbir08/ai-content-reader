import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import WordCounter from "@/components/WordCounter";

export const metadata: Metadata = { title: "Word counter" };

export default function WordCounterPage() {
  return (
    <>
      <PageHeader
        title="Word counter"
        description="Words, characters, sentences, reading time and keyword density, updated as you type. Runs in your browser."
      />
      <WordCounter />
    </>
  );
}
