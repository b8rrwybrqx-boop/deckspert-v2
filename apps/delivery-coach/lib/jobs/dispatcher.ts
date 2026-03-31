import { appendProcessingEvent, updateDeliveryJobStatus } from "../db/jobs.js";
import { getEnv } from "../env.js";
import { runDeliveryJobPipeline } from "./pipeline.js";

type DispatchOptions = {
  baseUrl?: string | null;
};

async function markDispatchFailure(jobId: string, message: string, details?: Record<string, unknown>) {
  await updateDeliveryJobStatus(jobId, "failed", {
    errorMessage: message,
    failedAt: new Date()
  });
  await appendProcessingEvent(jobId, "failed", "Background processing request failed.", {
    error: message,
    ...details
  });
}

export async function dispatchDeliveryJob(jobId: string, options?: DispatchOptions) {
  const env = getEnv();

  await updateDeliveryJobStatus(jobId, "queued");
  await appendProcessingEvent(jobId, "queued", "Job queued for background processing.");

  const baseUrl = options?.baseUrl || env.APP_BASE_URL;

  if (!baseUrl || process.env.NODE_ENV !== "production") {
    queueMicrotask(() => {
      void runDeliveryJobPipeline(jobId);
    });
    return;
  }

  void fetch(`${baseUrl.replace(/\/$/, "")}/api/jobs/${jobId}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-job-runner-secret": env.JOB_RUNNER_SECRET
    },
    body: JSON.stringify({ trigger: "dispatch" })
  })
    .then(async (response) => {
      if (!response.ok) {
        const details = await response.text().catch(() => "");
        const message = `Background processing request failed with ${response.status}${details ? `: ${details}` : "."}`;

        await markDispatchFailure(jobId, message, {
          status: response.status,
          details
        });
      }
    })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : "Background processing request failed.";
      await markDispatchFailure(jobId, message);
    });
}
