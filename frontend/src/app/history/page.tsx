import type { Metadata } from "next";
import History from "@/components/History";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Scan history" description="Reopen earlier results with their highlights. Stored only in this browser." />
      <History />
    </>
  );
}
