import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { runDeliveryJobPipeline } from "@/lib/jobs/pipeline";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const env = getEnv();
  const secret = request.headers.get("x-job-runner-secret");

  if (secret !== env.JOB_RUNNER_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { jobId } = await params;
  await runDeliveryJobPipeline(jobId);
  return NextResponse.json({ ok: true });
}
