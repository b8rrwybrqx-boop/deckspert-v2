import { NextResponse } from "next/server";

import { getDeliveryJob } from "@/lib/db/jobs";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getDeliveryJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    ...job,
    fileSize: Number(job.fileSize),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    failedAt: job.failedAt?.toISOString() ?? null,
    events: job.events.map((event) => ({
      stage: event.stage,
      message: event.message,
      metadataJson: event.metadataJson ?? null,
      createdAt: event.createdAt.toISOString()
    })),
    report: job.report?.reportJson ?? null
  });
}
