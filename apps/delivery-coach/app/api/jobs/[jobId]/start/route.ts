import { NextResponse } from "next/server";

import { dispatchDeliveryJob } from "@/lib/jobs/dispatcher";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  await dispatchDeliveryJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
