import { connection } from "next/server";
import { forwardToBackend } from "@/lib/backend";

// Job ids are 32 hex characters; anything else never reaches the backend.
const JOB_ID = /^[a-f0-9]{32}$/;

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection(); // always run at request time
  const { id } = await ctx.params;
  if (!JOB_ID.test(id)) {
    return Response.json({ detail: "Job not found." }, { status: 404 });
  }
  return forwardToBackend(`/api/v1/jobs/${id}`, { method: "GET", timeoutMs: 15_000 });
}
