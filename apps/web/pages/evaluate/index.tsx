import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { upload } from "@vercel/blob/client";
import { useAuth } from "../../src/auth/useAuth";
import { SaveAsPdfButton } from "../../src/components/SaveAsPdfButton";

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
      return "We couldn’t start this delivery review. Refresh the page and try again.";
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

// The backend enum has nine values, several of which describe implementation
// steps (compressing, sampling frames) rather than anything the user cares
// about. Map them onto four stages phrased as what Deckspert is doing to the
// recording. The enum itself is unchanged — this is presentation only.
const DELIVERY_STAGES = [
  { key: "received", title: "Recording received", statuses: ["uploaded", "queued"] },
  {
    key: "voice",
    title: "Reviewing voice and pacing",
    statuses: ["compressing", "extracting_audio", "transcribing"]
  },
  { key: "presence", title: "Reviewing presence and body language", statuses: ["sampling_frames"] },
  { key: "report", title: "Preparing your coaching report", statuses: ["generating_coaching"] }
] as const;

function stageIndexFor(status: DeliveryJobRecord["status"]) {
  if (status === "complete") return DELIVERY_STAGES.length;
  const index = DELIVERY_STAGES.findIndex((stage) =>
    (stage.statuses as readonly string[]).includes(status)
  );
  return index === -1 ? 0 : index;
}

// Heading shown above the stage list. "failed" is handled by its own panel.
function statusHeadingFor(status: DeliveryJobRecord["status"]) {
  if (status === "complete") return "Your delivery review is ready";
  if (status === "failed") return "We couldn’t complete this review";
  return "Analyzing your run-through";
}

function validateUploadFile(file: File) {
  if (!acceptedMimeTypes.includes(file.type as (typeof acceptedMimeTypes)[number])) {
    throw new Error("Upload an MP4 or MOV file. Other video formats are not supported yet.");
  }
  if (file.size > 600 * 1024 * 1024) {
    throw new Error(
      "This file is larger than the 600 MB upload limit. Shorten the recording or export a smaller version and try again."
    );
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
    return `Approx. ${start}–${end}`;
  }

  if (start === end) {
    return start;
  }

  return `${start}–${end}`;
}

function ReportView({ report }: { report: CoachingReport }) {
  const showExactTimestamps = !report.processingNotes.transcriptConfidence.toLowerCase().includes("approximate");

  return (
    <div className="delivery-report">
      <div className="delivery-score-grid">
        <ScoreCard label="Voice" value={report.dimensionScores.voicePacing} />
        <ScoreCard label="Pacing" value={report.dimensionScores.audienceEngagement} />
        <ScoreCard label="Body language" value={report.dimensionScores.bodyLanguage} />
        <ScoreCard label="Confidence" value={report.dimensionScores.presenceConfidence} />
      </div>

      <div className="card surface-card delivery-summary-card">
        <p className="section-kicker">Overall assessment</p>
        <div className="delivery-summary-layout">
          <p className="delivery-summary-copy">{report.executiveSummary}</p>
          <div className="delivery-overall-score">
            <p className="delivery-overall-score-label">Overall delivery score</p>
            <p className="delivery-overall-score-value">{report.overallScore}</p>
            <p className="delivery-overall-score-note">Your combined score across voice, pacing, body language, and confidence.</p>
          </div>
        </div>
      </div>

      <div className="delivery-two-column-grid">
        <div className="card surface-card">
          <p className="section-kicker">Top strengths</p>
          <div className="delivery-chip-list">
            {report.topStrengths.map((item) => (
              <div key={item} className="delivery-chip">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="card surface-card">
          <p className="section-kicker">Top priorities</p>
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
        <p className="section-kicker">Coaching moments</p>
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
                  <p className="delivery-moment-label">Why it matters</p>
                  <p className="delivery-moment-copy">{moment.whyItMatters}</p>
                </div>
                <div>
                  <p className="delivery-moment-label">Coaching tip</p>
                  <p className="delivery-moment-copy">{moment.coachingTip}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card surface-card delivery-practice-section">
        <p className="section-kicker">Practice plan</p>
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
        <p className="section-kicker">Processing details</p>
        <h3 className="card-title">System notes</h3>
        <p className="helper-copy">
          These notes are for internal review and testing. They are kept separate from the main coaching report.
        </p>
      </div>

      <div className="delivery-two-column-grid delivery-bottom-grid">
        <div className="card surface-card">
          <p className="section-kicker">Processing notes</p>
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
          <p className="section-kicker">Processing log</p>
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
          <h2 className="card-title">{statusHeadingFor(job.status)}</h2>
          <p className="helper-copy">
            {job.status === "failed"
              ? "Your recording was uploaded, but the analysis did not finish. Try again. If the problem continues, upload a shorter MP4 or contact support."
              : "Deckspert is reviewing your delivery and preparing timestamped coaching."}
          </p>
          <p className="helper-copy">{job.originalFilename}</p>
        </div>
      </div>

      <div className="delivery-stage-list">
        {DELIVERY_STAGES.map((stage, index) => {
          const currentIndex = stageIndexFor(job.status);
          const complete = index < currentIndex;
          const active = index === currentIndex && job.status !== "failed";
          const failedHere = job.status === "failed" && index === currentIndex;
          return (
            <div key={stage.key} className="delivery-stage-card">
              <div
                className={`delivery-stage-dot ${failedHere ? "delivery-stage-dot-failed" : complete ? "delivery-stage-dot-complete" : ""}`}
              />
              <div>
                <p className="delivery-stage-title">{stage.title}</p>
                <p className="helper-copy">
                  {failedHere ? "Stopped here" : active ? "In progress" : complete ? "Done" : "Not started"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {job.status === "failed" ? (
        <div className="delivery-actions">
          <button className="secondary-link delivery-retry-button" onClick={() => void onRetry()}>
            Try again
          </button>
        </div>
      ) : null}

      {job.events?.length ? (
        <div className="delivery-log">
          <h3 className="card-title">Processing log</h3>
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
  const pollInFlightRef = useRef(false);
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
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn’t load this delivery review. Refresh the page, or open it again from Continue Working."
          );
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
      if (pollInFlightRef.current || document.visibilityState === "hidden") {
        return;
      }

      pollInFlightRef.current = true;
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
      } finally {
        pollInFlightRef.current = false;
      }
    }, 4000);

    return () => {
      window.clearInterval(interval);
      pollInFlightRef.current = false;
    };
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
      setError("Your recording needs to finish uploading before the review can start.");
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

      navigate(`/platform/dynamic-delivery?jobId=${created.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn’t start this review. Your recording is still uploaded—try again."
      );
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
      setError(
        retryError instanceof Error
          ? retryError.message
          : "We couldn’t start the review again. Your recording is still here—try once more in a moment."
      );
    }
  }

  return (
    <section className="page delivery-page">
      <section className="app-hero">
        <p className="section-kicker">Amplify · Own the Room</p>
        <h1 className="page-title">Strengthen your presentation delivery</h1>
        <p className="page-subtitle">
          Upload a recorded run-through to get timestamped coaching on your voice, pacing, presence, body language, confidence, and audience connection, using the TPG Dynamic Delivery framework.
        </p>
      </section>

      <div className="card surface-card delivery-upload-card">
        <div className="delivery-upload-grid">
          <div className="delivery-upload-panel">
            <h2 className="card-title">Upload your recorded run-through</h2>
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
            <p className="helper-copy">
              Accepted formats: MP4 or MOV, up to 600 MB. For the most useful feedback, use a recording with clear audio that shows your upper body.
            </p>
            {file ? <p className="delivery-selected-file">Selected video: {file.name}</p> : null}
            {uploadState !== "idle" ? (
              <div className="delivery-progress-block">
                <div className="delivery-progress-header">
                  <span>
                    {uploadState === "uploaded"
                      ? "Upload complete. Your recording is ready to analyze."
                      : "Uploading your recording…"}
                  </span>
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
              <span className="card-title">What should the review focus on?</span>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Example: This is a 12-minute executive update. I want blunt feedback on pacing, filler words, confidence, and transitions."
              />
            </label>
            <div className="delivery-actions">
              <button className="primary-pill-button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {isSubmitting ? "Starting your delivery review…" : "Analyze my recording"}
              </button>
              {job ? (
                <button
                  className="secondary-link delivery-reset-button"
                  onClick={() => {
                    navigate("/platform/dynamic-delivery");
                    setJob(null);
                    setFile(null);
                    setContext("");
                    setUploadProgress(0);
                    setUploadState("idle");
                    sessionStorage.removeItem("delivery-upload");
                  }}
                >
                  Analyze another run-through
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
              <p className="section-kicker">Delivery review</p>
              <h2 className="page-title delivery-job-title">
                {job.status === "complete"
                  ? "Your delivery review is ready."
                  : job.status === "failed"
                    ? "We couldn’t complete this review."
                    : "Analyzing your run-through."}
              </h2>
              {/* The job id was rendered here. It is an internal identifier and
                  the filename is what the user recognizes. */}
              <p className="helper-copy">
                {job.status === "failed"
                  ? "Your recording was uploaded, but the analysis did not finish."
                  : "You can leave this page and return to the review from Continue Working."}
              </p>
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
                  setError(
                    refreshError instanceof Error
                      ? refreshError.message
                      : "We couldn’t check for an update just now. Your review is still running—try again in a moment."
                  );
                } finally {
                  setIsRefreshing(false);
                }
              }}
            >
              {isRefreshing ? "Checking…" : "Check for updates"}
            </button>
            {job.status === "complete" && job.report ? (
              <button
                className="secondary-link delivery-refresh-button"
                onClick={() =>
                  navigate(
                    showProcessingDetails
                      ? `/platform/dynamic-delivery?jobId=${job.id}`
                      : `/platform/dynamic-delivery?jobId=${job.id}&view=system`
                  )
                }
              >
                {showProcessingDetails ? "Back to report" : "Processing details"}
              </button>
            ) : null}
          </div>
          {job.status === "complete" && job.report ? (
            showProcessingDetails ? <ProcessingDetailsView job={job} /> : <ReportView report={job.report} />
          ) : (
            <JobStatusPanel job={job} onRetry={handleRetry} />
          )}
          {/* Only on the finished report — the processing view is internal notes
              and a half-analyzed job is not worth saving. */}
          {job.status === "complete" && job.report && !showProcessingDetails ? <SaveAsPdfButton /> : null}
        </>
      ) : null}
    </section>
  );
}
