import { dispatchDeliveryJob } from "../apps/delivery-coach/lib/jobs/dispatcher";
import { getDeliveryJob } from "../apps/delivery-coach/lib/db/jobs";
import { requireAuthenticatedUser } from "./auth";
import { ensureMethod, type ApiRequest, type ApiResponse } from "./_utils";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const jobId = req.params?.jobId;
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

  await dispatchDeliveryJob(jobId);
  res.status(200).json({ ok: true, jobId });
}
