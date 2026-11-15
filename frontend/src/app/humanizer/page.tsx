import type { Metadata } from "next";
import Humanizer from "@/components/Humanizer";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "AI Humanizer" };

export default function HumanizerPage() {
  return (
    <>
      <PageHeader
        title="AI humanizer"
        description="Rewrite AI-sounding text so it reads naturally, in the tone you choose, while keeping its meaning. The rewrite is checked with the detector, so you can compare the scores before and after."
      />
      <Humanizer />
    </>
  );
}
