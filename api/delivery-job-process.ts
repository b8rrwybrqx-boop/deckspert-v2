import { getEnv } from "../apps/delivery-coach/lib/env.js";
import { runDeliveryJobPipeline } from "../apps/delivery-coach/lib/jobs/pipeline.js";
import { ensureMethod, readHeader, readParam, type ApiRequest, type ApiResponse } from "./_utils.js";

export const config = {
  maxDuration: 300
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const env = getEnv();
  const secret = readHeader(req, "x-job-runner-secret");

  if (secret !== env.JOB_RUNNER_SECRET) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const jobId = readParam(req, "jobId");
  if (!jobId) {
    res.status(400).json({ error: "Job ID is required." });
    return;
  }

  try {
    await runDeliveryJobPipeline(jobId);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Delivery pipeline failed."
    });
  }
}
