import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../src/auth/useAuth";

type UploadState = "idle" | "uploading" | "uploaded" | "error";

type ProcessingEventRecord = {
  stage: string;
  message: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
};

type CoachingMoment = {
  timestamp: string;
  startSec: number;
  endSec: number;
  title: string;
  observation: string;
  whyItMatters: string;
  coachingTip: string;
  severity: "low" | "medium" | "high";
};

type PracticePlanItem = {
  focusArea: string;
  exercise: string;
  frequency: string;
  goal: string;
};

type CoachingReport = {
  executiveSummary: string;
  overallScore: number;
  dimensionScores: {
    voicePacing: number;
    presenceConfidence: number;
    bodyLanguage: number;
    audienceEngagement: number;
  };
  topStrengths: string[];
  topPriorityFixes: string[];
  coachingMoments: CoachingMoment[];
  practicePlan: PracticePlanItem[];
  processingNotes: {
    transcriptConfidence: string;
    visualConfidence: string;
    limitations: string[];
  };
};

type DeliveryJobRecord = {
  id: string;
  status:
    | "uploaded"
    | "queued"
    | "compressing"
    | "extracting_audio"
    | "transcribing"
    | "sampling_frames"
    | "generating_coaching"
    | "complete"
    | "failed";
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  userContext?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  events?: ProcessingEventRecord[];
  report?: CoachingReport | null;
};

type UploadedBlobResult = {
  originalFilename: string;
  originalBlobUrl: string;
  fileSize: number;
  mimeType: "video/mp4" | "video/quicktime";
};

async function getApiErrorMessage(response: Response, fallback: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawText) as { error?: string };
    if (!parsed.error) {
      return fallback;
    }

    if (parsed.error.includes("Unique constraint failed")) {
      return "We ran into an account-sync issue while starting this delivery review. Please refresh the page and try again.";
    }

    return parsed.error;
  } catch {
    return rawText;
  }
}

async function uploadVideoDirect(
  file: File,
  onProgress?: (percent: number) => void,
  handleUploadUrl = "/api/delivery/upload-token"
): Promise<{ url: string; pathname: string; contentType: string }> {
  const { upload } = await import("../../../delivery-coach/node_modules/@vercel/blob/dist/client.js");

  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl,
    onUploadProgress(progressEvent: { percentage: number }) {
      onProgress?.(Math.round(progressEvent.percentage));
    }
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType
  };
}

const acceptedMimeTypes = ["video/mp4", "video/quicktime"] as const;
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

const statusLabels: Record<DeliveryJobRecord["status"], string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  compressing: "Compressing",
  extracting_audio: "Extracting audio",
  transcribing: "Transcribing",
  sampling_frames: "Sampling frames",
  generating_coaching: "Generating coaching",
  complete: "Complete",
  failed: "Failed"
};

function validateUploadFile(file: File) {
  if (!acceptedMimeTypes.includes(file.type as (typeof acceptedMimeTypes)[number])) {
    throw new Error("Only MP4 and MOV presentation videos are supported right now.");
  }
  if (file.size > 600 * 1024 * 1024) {
    throw new Error("Files above 600 MB are blocked right now to keep uploads reliable.");
  }
}

function isTerminalStatus(status: DeliveryJobRecord["status"]) {
  return status === "complete" || status === "failed";
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="delivery-score-card">
      <p className="delivery-score-label">{label}</p>
      <p className="delivery-score-value">{value}</p>
      <p className="delivery-score-scale">out of 10</p>
    </div>
  );
}

function formatMomentRange(moment: CoachingMoment, showExactTimestamps: boolean) {
  const formatSeconds = (value: number) => {
    const minutes = Math.floor(value / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const start = formatSeconds(moment.startSec);
  const end = formatSeconds(moment.endSec);

  if (!showExactTimestamps) {
    return `Approx. ${start}-${end}`;
  }

  if (start === end) {
    return start;
  }

  return `${start}-${end}`;
}

function ReportView({ report }: { report: CoachingReport }) {
  const showExactTimestamps = !report.processingNotes.transcriptConfidence.toLowerCase().includes("approximate");

  return (
    <div className="delivery-report">
      <div className="card surface-card delivery-summary-card">
        <p className="section-kicker">Executive Summary</p>
        <div className="delivery-summary-layout">
          <p className="delivery-summary-copy">{report.executiveSummary}</p>
          <div className="delivery-overall-score">
            <p className="delivery-overall-score-label">Overall Delivery Score</p>
            <p className="delivery-overall-score-value">{report.overallScore}</p>
            <p className="delivery-overall-score-note">Score based on transcript signals and any visual cues available for this report.</p>
          </div>
        </div>
      </div>

      <div className="delivery-score-grid">
        <ScoreCard label="Voice & Pacing" value={report.dimensionScores.voicePacing} />
        <ScoreCard label="Presence & Confidence" value={report.dimensionScores.presenceConfidence} />
        <ScoreCard label="Body Language" value={report.dimensionScores.bodyLanguage} />
        <ScoreCard label="Audience Engagement" value={report.dimensionScores.audienceEngagement} />
      </div>

      <div className="delivery-two-column-grid">
        <div className="card surface-card">
          <p className="section-kicker">Top 3 Strengths</p>
          <div className="delivery-chip-list">
            {report.topStrengths.map((item) => (
              <div key={item} className="delivery-chip">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="card surface-card">
          <p className="section-kicker">Top 3 Priority Fixes</p>
          <div className="delivery-chip-list">
            {report.topPriorityFixes.map((item) => (
              <div key={item} className="delivery-chip">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card surface-card">
        <p className="section-kicker">Coaching Moments</p>
        <div className="delivery-moments">
          {report.coachingMoments.map((moment) => (
            <div key={`${moment.title}-${moment.timestamp}-${moment.observation}`} className="delivery-moment-card">
              <div className="delivery-moment-header">
                <div>
                  <p className="delivery-moment-timestamp">{formatMomentRange(moment, showExactTimestamps)}</p>
                  <h3 className="delivery-moment-title">{moment.title}</h3>
                </div>
                <span className={`delivery-severity delivery-severity-${moment.severity}`}>{moment.severity}</span>
              </div>
              <div className="delivery-moment-grid">
                <div>
                  <p className="delivery-moment-label">Observation</p>
                  <p className="delivery-moment-copy">{moment.observation}</p>
                </div>
                <div>
                  <p className="delivery-moment-label">Why It Matters</p>
                  <p className="delivery-moment-copy">{moment.whyItMatters}</p>
                </div>
                <div>
                  <p className="delivery-moment-label">Coaching Tip</p>
                  <p className="delivery-moment-copy">{moment.coachingTip}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card surface-card delivery-practice-section">
        <p className="section-kicker">Recommended Practice Plan</p>
        <div className="delivery-practice-list">
          {report.practicePlan.map((item) => (
            <div key={`${item.focusArea}-${item.goal}`} className="delivery-practice-card">
              <h3 className="delivery-practice-title">{item.focusArea}</h3>
              <p className="delivery-practice-copy">{item.exercise}</p>
              <div className="delivery-practice-meta">
                <p>
                  <strong>Frequency:</strong> {item.frequency}
                </p>
                <p>
                  <strong>Goal:</strong> {item.goal}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProcessingDetailsView({ job }: { job: DeliveryJobRecord }) {
  if (!job.report) {
    return null;
  }

  return (
    <div className="delivery-report">
      <div className="card surface-card">
        <p className="section-kicker">Processing Details</p>
        <h3 className="card-title">System Notes</h3>
        <p className="helper-copy">
          These notes are for internal review and testing. They are kept separate from the main coaching report.
        </p>
      </div>

      <div className="delivery-two-column-grid delivery-bottom-grid">
        <div className="card surface-card">
          <p className="section-kicker">Processing Notes</p>
          <div className="delivery-notes-list">
            <div className="delivery-note-card">
              <p className="delivery-note-title">Transcript confidence</p>
              <p>{job.report.processingNotes.transcriptConfidence}</p>
            </div>
            <div className="delivery-note-card">
              <p className="delivery-note-title">Visual confidence</p>
              <p>{job.report.processingNotes.visualConfidence}</p>
            </div>
            {job.report.processingNotes.limitations.length ? (
              <div className="delivery-note-card">
                <p className="delivery-note-title">Internal limitations</p>
                <ul className="list">
                  {job.report.processingNotes.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card surface-card">
          <p className="section-kicker">Processing Log</p>
          {job.events?.length ? (
            <div className="delivery-log-list">
              {job.events.map((event) => (
                <div key={`${event.stage}-${event.createdAt}`} className="delivery-log-entry">
                  <p className="section-kicker">{event.stage}</p>
                  <p>{event.message}</p>
                  <p className="helper-copy">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper-copy">No processing events were captured for this job.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function JobStatusPanel({ job, onRetry }: { job: DeliveryJobRecord; onRetry: () => Promise<void> }) {
  return (
    <div className="card surface-card delivery-status-panel">
      <div className="delivery-status-heading">
        <div>
          <p className="section-kicker">Processing</p>
          <h2 className="card-title">{statusLabels[job.status]}</h2>
          <p className="helper-copy">{job.originalFilename}</p>
        </div>
        {job.errorMessage ? <p className="delivery-error-text">{job.errorMessage}</p> : null}
      </div>

      <div className="delivery-stage-list">
        {orderedStatuses.map((status) => {
          const complete = orderedStatuses.indexOf(status) <= orderedStatuses.indexOf(job.status as (typeof orderedStatuses)[number]);
          const active = job.status === status;
          return (
            <div key={status} className="delivery-stage-card">
              <div
                className={`delivery-stage-dot ${job.status === "failed" && active ? "delivery-stage-dot-failed" : complete ? "delivery-stage-dot-complete" : ""}`}
              />
              <div>
                <p className="delivery-stage-title">{statusLabels[status]}</p>
                <p className="helper-copy">{active ? "Current stage" : complete ? "Completed" : "Pending"}</p>
              </div>
            </div>
          );
        })}
      </div>

      {job.status === "failed" ? (
        <div className="delivery-actions">
          <button className="secondary-link delivery-retry-button" onClick={() => void onRetry()}>
            Retry Job
          </button>
        </div>
      ) : null}

      {job.events?.length ? (
        <div className="delivery-log">
          <h3 className="card-title">Processing Log</h3>
          <div className="delivery-log-list">
            {job.events.map((event) => (
              <div key={`${event.stage}-${event.createdAt}`} className="delivery-log-entry">
                <p className="section-kicker">{event.stage}</p>
                <p>{event.message}</p>
                <p className="helper-copy">{new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EvaluatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, getRequestHeaders } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [job, setJob] = useState<DeliveryJobRecord | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const jobId = searchParams.get("jobId");
  const showProcessingDetails = searchParams.get("view") === "system";

  const canSubmit = useMemo(() => uploadState === "uploaded" && !isSubmitting, [uploadState, isSubmitting]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let cancelled = false;

    async function loadJob() {
      setIsRefreshing(true);
      try {
        const headers = await getRequestHeaders();
        const response = await fetch(`/api/delivery/jobs/${jobId}`, {
          method: "GET",
          headers
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "We couldn't load this delivery review right now."));
        }

        const nextJob = (await response.json()) as DeliveryJobRecord;
        if (!cancelled) {
          setJob(nextJob);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load delivery job.");
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }

    void loadJob();

    return () => {
      cancelled = true;
    };
  }, [jobId, getRequestHeaders]);

  useEffect(() => {
    if (!jobId || !job || isTerminalStatus(job.status)) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const headers = await getRequestHeaders();
        const response = await fetch(`/api/delivery/jobs/${jobId}`, {
          method: "GET",
          headers
        });

        if (!response.ok) {
          return;
        }

        const nextJob = (await response.json()) as DeliveryJobRecord;
        setJob(nextJob);
      } catch {
        return;
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [jobId, job, getRequestHeaders]);

  async function handleFileChange(nextFile: File | null) {
    setError("");
    setUploadProgress(0);
    setUploadState("idle");
    setFile(nextFile);

    if (!nextFile) {
      sessionStorage.removeItem("delivery-upload");
      return;
    }

    try {
      validateUploadFile(nextFile);
      setUploadState("uploading");
      const blob = await uploadVideoDirect(nextFile, setUploadProgress, "/api/delivery/upload-token");
      const payload: UploadedBlobResult = {
        originalFilename: nextFile.name,
        originalBlobUrl: blob.url,
        fileSize: nextFile.size,
        mimeType: nextFile.type as UploadedBlobResult["mimeType"]
      };
      sessionStorage.setItem("delivery-upload", JSON.stringify(payload));
      setUploadState("uploaded");
    } catch (uploadError) {
      setUploadState("error");
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  async function handleSubmit() {
    const savedUpload = sessionStorage.getItem("delivery-upload");
    if (!savedUpload) {
      setError("Upload must complete before the delivery job can be created.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload = JSON.parse(savedUpload) as UploadedBlobResult;
      const headers = await getRequestHeaders();
      const createResponse = await fetch("/api/delivery/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          ...payload,
          userContext: context.trim() || null
        })
      });

      if (!createResponse.ok) {
        throw new Error(await getApiErrorMessage(createResponse, "We couldn't start this delivery review."));
      }

      const created = (await createResponse.json()) as { id: string };

      const startResponse = await fetch(`/api/delivery/jobs/${created.id}/start`, {
        method: "POST",
        headers
      });

      if (!startResponse.ok) {
        throw new Error(await getApiErrorMessage(startResponse, "The upload completed, but processing didn't start. Please try again."));
      }

      navigate(`/evaluate?jobId=${created.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Job creation failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetry() {
    if (!job) {
      return;
    }

    setError("");

    try {
      const headers = await getRequestHeaders();
      const response = await fetch(`/api/delivery/jobs/${job.id}/retry`, {
        method: "POST",
        headers
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "We couldn't retry this delivery review."));
      }

      const refreshed = await fetch(`/api/delivery/jobs/${job.id}`, {
        method: "GET",
        headers
      });

      if (!refreshed.ok) {
        throw new Error(await refreshed.text());
      }

      setJob((await refreshed.json()) as DeliveryJobRecord);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed.");
    }
  }

  return (
    <section className="page delivery-page">
      <section className="app-hero">
        <p className="section-kicker">Dynamic Delivery Coach</p>
        <h1 className="page-title">Review presentation delivery with clear, focused coaching.</h1>
        <p className="page-subtitle">
          Review voice and pacing, pauses and emphasis, filler words, confidence, presence, and audience engagement in one report.
        </p>
      </section>

      <div className="card surface-card delivery-upload-card">
        <div className="delivery-upload-grid">
          <div className="delivery-upload-panel">
            <h2 className="card-title">Presentation Video</h2>
            <label className="delivery-file-input">
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  void handleFileChange(nextFile);
                }}
              />
            </label>
            <p className="helper-copy">Accepted types: MP4 and MOV. Large files upload securely before processing starts.</p>
            {file ? <p className="delivery-selected-file">Selected video: {file.name}</p> : null}
            {uploadState !== "idle" ? (
              <div className="delivery-progress-block">
                <div className="delivery-progress-header">
                  <span>{uploadState === "uploaded" ? "Upload complete" : "Upload progress"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="delivery-progress-track">
                  <div className="delivery-progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="delivery-context-panel">
            <label>
              <span className="card-title">Context / What kind of feedback do you want?</span>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Example: This is a 12-minute executive update. I want blunt feedback on pacing, filler words, confidence, and transitions."
              />
            </label>
            <div className="delivery-actions">
              <button className="primary-pill-button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {isSubmitting ? "Creating Job..." : "Start Delivery Analysis"}
              </button>
              {job ? (
                <button
                  className="secondary-link delivery-reset-button"
                  onClick={() => {
                    navigate("/evaluate");
                    setJob(null);
                    setFile(null);
                    setContext("");
                    setUploadProgress(0);
                    setUploadState("idle");
                    sessionStorage.removeItem("delivery-upload");
                  }}
                >
                  Start New Analysis
                </button>
              ) : null}
            </div>
            {error ? <p className="delivery-error-text">{error}</p> : null}
          </div>
        </div>
      </div>

      {job ? (
        <>
          <div className="card surface-card delivery-job-header">
            <div>
              <p className="section-kicker">Delivery Job</p>
              <h2 className="page-title delivery-job-title">
                {job.status === "complete"
                  ? "Your delivery report is ready."
                  : job.status === "failed"
                    ? "This job failed. Review the processing log and retry when ready."
                    : "Your video is being processed. This page is refresh-safe and will keep updating."}
              </h2>
              <p className="helper-copy">Job ID: {job.id}</p>
            </div>
            <button
              className="secondary-link delivery-refresh-button"
              onClick={async () => {
                if (!jobId) {
                  return;
                }
                setIsRefreshing(true);
                try {
                  const response = await fetch(`/api/delivery/jobs/${jobId}`, {
                    method: "GET"
                    ,
                    headers: await getRequestHeaders()
                  });
                  if (!response.ok) {
                    throw new Error(await getApiErrorMessage(response, "We couldn't refresh this delivery review right now."));
                  }
                  setJob((await response.json()) as DeliveryJobRecord);
                } catch (refreshError) {
                  setError(refreshError instanceof Error ? refreshError.message : "Refresh failed.");
                } finally {
                  setIsRefreshing(false);
                }
              }}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Status"}
            </button>
            {job.status === "complete" && job.report ? (
              <button
                className="secondary-link delivery-refresh-button"
                onClick={() => navigate(showProcessingDetails ? `/evaluate?jobId=${job.id}` : `/evaluate?jobId=${job.id}&view=system`)}
              >
                {showProcessingDetails ? "Back To Report" : "Processing Details"}
              </button>
            ) : null}
          </div>
          {job.status === "complete" && job.report ? (
            showProcessingDetails ? <ProcessingDetailsView job={job} /> : <ReportView report={job.report} />
          ) : (
            <JobStatusPanel job={job} onRetry={handleRetry} />
          )}
        </>
      ) : null}
    </section>
  );
}
