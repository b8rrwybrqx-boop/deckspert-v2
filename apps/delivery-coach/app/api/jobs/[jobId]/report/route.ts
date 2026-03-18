import { NextResponse } from "next/server";

import { getDeliveryJob } from "@/lib/db/jobs";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getDeliveryJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (!job.report) {
    return NextResponse.json({ error: "Report not ready." }, { status: 404 });
  }
  return NextResponse.json(job.report.reportJson);
}
