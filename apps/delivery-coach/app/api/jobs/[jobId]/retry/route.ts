import { NextResponse } from "next/server";

import { appendProcessingEvent, updateDeliveryJobStatus } from "@/lib/db/jobs";
import { dispatchDeliveryJob } from "@/lib/jobs/dispatcher";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  await updateDeliveryJobStatus(jobId, "uploaded", {
    errorMessage: null,
    failedAt: undefined
  });
  await appendProcessingEvent(jobId, "uploaded", "Retry requested. Job reset to uploaded.");
  await dispatchDeliveryJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
