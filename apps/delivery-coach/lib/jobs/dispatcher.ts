import { waitUntil } from "@vercel/functions";
import { appendProcessingEvent, updateDeliveryJobStatus } from "../db/jobs.js";
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
  await updateDeliveryJobStatus(jobId, "queued");
  await appendProcessingEvent(jobId, "queued", "Job queued for background processing.");
  const backgroundTask = runDeliveryJobPipeline(jobId).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Background processing request failed.";
    await markDispatchFailure(jobId, message);
  });

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    waitUntil(backgroundTask);
    return;
  }

  queueMicrotask(() => {
    void backgroundTask;
  });
}
