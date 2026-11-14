import type { Metadata } from "next";
import CitationGenerator from "@/components/CitationGenerator";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Citation generator" };

export default function CitationPage() {
  return (
    <>
      <PageHeader
        title="Citation generator"
        description="Create references and in-text citations in APA 7, MLA 9, Chicago 17 or Harvard for websites, books and journal articles. Copy them with formatting intact."
      />
      <CitationGenerator />
    </>
  );
}
