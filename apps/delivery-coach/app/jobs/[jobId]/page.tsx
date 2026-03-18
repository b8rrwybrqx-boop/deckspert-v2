import { notFound } from "next/navigation";

import { JobPageClient } from "@/components/job-page-client";
import { getDeliveryJob } from "@/lib/db/jobs";
import { deliveryJobSchema } from "@/lib/validation/delivery";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getDeliveryJob(jobId);

  if (!job) {
    notFound();
  }

  const parsed = deliveryJobSchema.parse({
    ...job,
    fileSize: Number(job.fileSize),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    failedAt: job.failedAt?.toISOString() ?? null,
    events: job.events.map((event) => ({
      stage: event.stage,
      message: event.message,
      metadataJson: (event.metadataJson as Record<string, unknown> | null) ?? null,
      createdAt: event.createdAt.toISOString()
    })),
    report: job.report?.reportJson ?? null
  });

  return (
    <main className="page-shell">
      <JobPageClient jobId={jobId} initialJob={parsed} />
    </main>
  );
}
