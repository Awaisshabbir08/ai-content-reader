import { connection } from "next/server";
import { forwardToBackend } from "@/lib/backend";

// Detector, limits and calibration accuracy, for the "How it works" page.
export async function GET() {
  await connection(); // always run at request time
  return forwardToBackend("/api/v1/info", { method: "GET", timeoutMs: 10_000 });
}
