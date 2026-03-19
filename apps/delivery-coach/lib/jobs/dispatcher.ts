import { appendProcessingEvent, updateDeliveryJobStatus } from "../db/jobs.js";
import { getEnv } from "../env.js";
import { runDeliveryJobPipeline } from "./pipeline.js";

type DispatchOptions = {
  baseUrl?: string | null;
};

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

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/jobs/${jobId}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-job-runner-secret": env.JOB_RUNNER_SECRET
      },
      body: JSON.stringify({ trigger: "dispatch" })
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const message = `Background processing request failed with ${response.status}${details ? `: ${details}` : "."}`;

      await updateDeliveryJobStatus(jobId, "failed", {
        errorMessage: message,
        failedAt: new Date()
      });
      await appendProcessingEvent(jobId, "failed", "Background processing request failed.", {
        status: response.status,
        details
      });
      throw new Error(message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background processing request failed.";

    await updateDeliveryJobStatus(jobId, "failed", {
      errorMessage: message,
      failedAt: new Date()
    });
    await appendProcessingEvent(jobId, "failed", "Background processing request failed.", {
      error: message
    });
    throw error;
  }
}
