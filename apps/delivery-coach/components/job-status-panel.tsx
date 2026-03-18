"use client";

import { statusLabels } from "@/lib/jobs/stages";
import type { DeliveryJobRecord } from "@/types/delivery";

const orderedStatuses = [
  "uploaded",
  "queued",
  "compressing",
  "extracting_audio",
  "transcribing",
  "sampling_frames",
  "generating_coaching",
  "complete"
] as const;

export function JobStatusPanel({ job }: { job: DeliveryJobRecord }) {
  return (
    <div className="panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Processing</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{statusLabels[job.status]}</h2>
          <p className="mt-2 text-sm text-slate">{job.originalFilename}</p>
        </div>
        {job.errorMessage ? <p className="max-w-md text-sm font-medium text-danger">{job.errorMessage}</p> : null}
      </div>

      <div className="mt-6 grid gap-3">
        {orderedStatuses.map((status) => {
          const complete = orderedStatuses.indexOf(status) <= orderedStatuses.indexOf(job.status as (typeof orderedStatuses)[number]);
          const active = job.status === status;
          return (
            <div key={status} className="flex items-center gap-3 rounded-2xl border border-line bg-cloud/40 px-4 py-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  job.status === "failed" && active ? "bg-danger" : complete ? "bg-success" : "bg-line"
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-ink">{statusLabels[status]}</p>
                <p className="text-xs text-slate">{active ? "Current stage" : complete ? "Completed" : "Pending"}</p>
              </div>
            </div>
          );
        })}
      </div>

      {job.events?.length ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">Processing log</p>
          <div className="mt-3 space-y-3">
            {job.events.map((event) => (
              <div key={`${event.stage}-${event.createdAt}`} className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/65">{event.stage}</p>
                <p className="mt-1 text-sm text-ink">{event.message}</p>
                <p className="mt-1 text-xs text-slate">{new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
