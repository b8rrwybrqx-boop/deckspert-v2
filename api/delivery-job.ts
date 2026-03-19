import { getDeliveryJob } from "../apps/delivery-coach/lib/db/jobs";
import { requireAuthenticatedUser } from "./auth";
import { ensureMethod, readParam, type ApiRequest, type ApiResponse } from "./_utils";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "GET")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const jobId = readParam(req, "jobId");
  if (!jobId) {
    res.status(400).json({ error: "Job ID is required." });
    return;
  }

  const job = await getDeliveryJob(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  if (job.userId && job.userId !== user.id) {
    res.status(403).json({ error: "You do not have access to this delivery job." });
    return;
  }

  res.status(200).json({
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
