import type { Metadata } from "next";
import Batch from "@/components/Batch";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Batch files" };

export default function BatchPage() {
  return (
    <>
      <PageHeader
        title="Batch file check"
        description="Check up to 20 documents in one go. Results appear as each file finishes; download them all as a CSV."
      />
      <Batch />
    </>
  );
}
