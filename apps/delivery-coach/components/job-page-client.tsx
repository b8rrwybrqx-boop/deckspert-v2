"use client";

import { useEffect, useMemo, useState } from "react";

import { JobStatusPanel } from "@/components/job-status-panel";
import { ReportView } from "@/components/report-view";
import type { DeliveryJobRecord } from "@/types/delivery";

function isTerminalStatus(status: DeliveryJobRecord["status"]) {
  return status === "complete" || status === "failed";
}

export function JobPageClient({ jobId, initialJob }: { jobId: string; initialJob: DeliveryJobRecord }) {
  const [job, setJob] = useState(initialJob);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isTerminalStatus(job.status)) {
      return;
    }

    const interval = setInterval(async () => {
      setIsRefreshing(true);
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store"
        });
        if (response.ok) {
          const nextJob = (await response.json()) as DeliveryJobRecord;
          setJob(nextJob);
        }
      } finally {
        setIsRefreshing(false);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [job.status, jobId]);

  const headerCopy = useMemo(() => {
    if (job.status === "complete") {
      return "Your delivery report is ready.";
    }
    if (job.status === "failed") {
      return "This job failed. Review the processing log and retry when ready.";
    }
    return "Your video is still being processed. This page is refresh-safe and will continue polling.";
  }, [job.status]);

  return (
    <div className="space-y-8">
      <div className="panel p-8">
        <p className="eyebrow">Delivery job</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-light text-ink">{headerCopy}</h2>
            <p className="mt-3 text-sm text-slate">Job ID: {job.id}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsRefreshing(true);
              try {
                const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
                if (response.ok) {
                  setJob((await response.json()) as DeliveryJobRecord);
                }
              } finally {
                setIsRefreshing(false);
              }
            }}
            className="rounded-full border border-line bg-white px-5 py-2 text-sm font-semibold text-ink"
          >
            {isRefreshing ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </div>

      {job.status === "complete" && job.report ? <ReportView report={job.report} /> : <JobStatusPanel job={job} />}
    </div>
  );
}
