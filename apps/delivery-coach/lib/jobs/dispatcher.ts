import { appendProcessingEvent, updateDeliveryJobStatus } from "../db/jobs.js";
import { getEnv } from "../env.js";
import { runDeliveryJobPipeline } from "./pipeline.js";

export async function dispatchDeliveryJob(jobId: string) {
  const env = getEnv();

  await updateDeliveryJobStatus(jobId, "queued");
  await appendProcessingEvent(jobId, "queued", "Job queued for background processing.");

  if (!env.APP_BASE_URL || process.env.NODE_ENV !== "production") {
    queueMicrotask(() => {
      void runDeliveryJobPipeline(jobId);
    });
    return;
  }

  await fetch(`${env.APP_BASE_URL}/api/jobs/${jobId}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-job-runner-secret": env.JOB_RUNNER_SECRET
    },
    body: JSON.stringify({ trigger: "dispatch" })
  });
}
