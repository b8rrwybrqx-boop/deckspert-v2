import { useState } from "react";
import { Link } from "react-router-dom";
import { upload } from "@vercel/blob/client";
import { postJson } from "../../src/api";
import { EmailGate, getStoredEmail } from "../../src/components/EmailGate";

type ArtifactKind = "pdf" | "pptx" | "text";

type SectionFeedback = {
  key: string;
  label: string;
  score: number;
  status: "present" | "weak" | "missing" | "unclear";
  feedback: string;
  evidence: string | null;
};

type FreeEvaluatorResponse = {
  evaluatorVersion: "free-v1";
  deckName: string | null;
  slideCount: number | null;
  overallRead: "strong" | "mixed" | "needs work";
  executiveSummary: string;
  sectionFeedback: SectionFeedback[];
  overallInsights: string[];
  professionalTeaser: string;
};

const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md";
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

function inferArtifactKind(file: File): ArtifactKind {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "ppt" || extension === "pptx") return "pptx";
  return "text";
}

async function uploadDocumentDirect(
  file: File,
  handleUploadUrl = "/api/upload-token"
): Promise<{ url: string; pathname: string; contentType: string }> {
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl });
  return { url: blob.url, pathname: blob.pathname, contentType: blob.contentType };
}

async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text(), fileSize: file.size };
  }
  const blob = await uploadDocumentDirect(file);
  return { label: file.name, filename: file.name, contentType: blob.contentType || file.type, kind, sourceUrl: blob.url, fileSize: file.size };
}

function statusLabel(status: SectionFeedback["status"]) {
  const labels: Record<SectionFeedback["status"], string> = {
    present: "Present",
    weak: "Weak",
    missing: "Missing",
    unclear: "Unclear"
  };
  return labels[status];
}

function overallReadLabel(read: FreeEvaluatorResponse["overallRead"]) {
  const labels: Record<FreeEvaluatorResponse["overallRead"], string> = {
    strong: "Strong story",
    mixed: "Mixed story",
    "needs work": "Needs work"
  };
  return labels[read];
}

// ── Friendly inline notice (not a system error) ──────────────────────────────

type NoticeKind = "info" | "warn" | "block";

function FileNotice({ kind, message }: { kind: NoticeKind; message: string }) {
  const classMap: Record<NoticeKind, string> = {
    info: "free-evaluator-notice free-evaluator-notice-info",
    warn: "free-evaluator-notice free-evaluator-notice-warn",
    block: "free-evaluator-notice free-evaluator-notice-block"
  };
  return <p className={classMap[kind]}>{message}</p>;
}

export default function FreeEvaluatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileNotice, setFileNotice] = useState<{ kind: NoticeKind; message: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<FreeEvaluatorResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [capturedEmail, setCapturedEmail] = useState<string | null>(() => getStoredEmail());
  const [showEmailGate, setShowEmailGate] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileNotice(null);
    setError("");

    if (!selected) return;

    // E3, Friendly file size check
    if (selected.size > MAX_FILE_BYTES) {
      setFileNotice({
        kind: "block",
        message: `This file is ${(selected.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_MB} MB limit. Try compressing your images or exporting as a flatter PDF.`
      });
      return;
    }

    // Soft hints for known problem file types
    const name = selected.name.toLowerCase();
    if (name.endsWith(".ppt")) {
      setFileNotice({
        kind: "warn",
        message: "Older .ppt files may not extract cleanly. Save as .pptx or export as PDF for best results."
      });
    }
  }

  async function runEvaluation(emailOverride?: string) {
    if (!file) return;

    const emailToUse = emailOverride ?? capturedEmail;

    setError("");
    setResult(null);
    setShowEmailGate(false);
    setIsSubmitting(true);
    setStatusMessage("");

    try {
      setStatusMessage(inferArtifactKind(file) === "text" ? "Preparing file..." : "Uploading deck...");
      const artifact = await buildArtifact(file);
      setStatusMessage("Evaluating story structure...");
      const response = await postJson<FreeEvaluatorResponse>("/api/free-evaluator", {
        artifacts: [artifact],
        notes,
        email: emailToUse ?? undefined
      });
      setResult(response);
      setStatusMessage("");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.";
      setError(message);
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEvaluate() {
    if (!file) {
      setError("Select a PDF, PowerPoint, or text file to get started.");
      return;
    }
    // Block if file is over the limit
    if (file.size > MAX_FILE_BYTES) {
      setFileNotice({
        kind: "block",
        message: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_MB} MB limit. Try compressing your images or exporting as a flatter PDF.`
      });
      return;
    }
    if (!capturedEmail) {
      setShowEmailGate(true);
      return;
    }
    void runEvaluation();
  }

  function handleEmailCaptured(email: string) {
    setCapturedEmail(email);
    void runEvaluation(email); // pass directly, don't rely on async state update
  }

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-hero-grid">
          <div>
            <p className="public-kicker">Free Evaluator</p>
            <h1>Upload a presentation and find out what your story is missing.</h1>
            <p className="public-hero-copy">
              Upload your deck. Get scored against the TPG framework. See exactly where your story is strong and where it's losing the room.
            </p>
          </div>
          <div className="public-hero-panel">
            <p className="public-panel-label">What you get</p>
            <ul className="public-panel-list">
              <li>Section scores across 8 story elements</li>
              <li>Present / Weak / Missing status for each</li>
              <li>Overall story read</li>
              <li>Full detailed feedback sent to your email</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner free-evaluator-layout">
          <div className="free-evaluator-form">
            <p className="public-kicker">Start</p>
            <h2>See where your story stands.</h2>
            <label className="field">
              <span className="metric-label">Presentation file <span className="free-evaluator-limit-hint">PDF or PPTX · max {MAX_FILE_MB} MB</span></span>
              <input
                type="file"
                accept={acceptedTypes}
                onChange={handleFileChange}
              />
            </label>
            {file && !fileNotice ? <p className="helper-copy">Selected: {file.name}</p> : null}
            {fileNotice ? <FileNotice kind={fileNotice.kind} message={fileNotice.message} /> : null}
            <label className="field">
              <span className="metric-label">Optional notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional: audience, meeting type, or anything useful for interpreting the deck."
              />
            </label>
            <button
              className="public-primary-button"
              type="button"
              onClick={handleEvaluate}
              disabled={isSubmitting || fileNotice?.kind === "block"}
            >
              {isSubmitting ? statusMessage || "Evaluating..." : "Evaluate deck"}
            </button>
            {statusMessage && !isSubmitting ? <p className="helper-copy">{statusMessage}</p> : null}
            {error ? (
              <div className="free-evaluator-error-card">
                <p className="free-evaluator-error-title">Couldn't complete the evaluation</p>
                <p className="free-evaluator-error-body">{error}</p>
              </div>
            ) : null}
          </div>

          <div className="free-evaluator-results">
            {showEmailGate ? (
              <EmailGate
                headline="Enter your email to see your story evaluation."
                subCopy="We'll send your full results there too. No spam. Unsubscribe anytime."
                submitLabel="See my story evaluation"
                source="free-evaluator"
                onSuccess={handleEmailCaptured}
              />
            ) : !result ? (
              <div className="public-module-card">
                <p className="public-card-tag">Result</p>
                <h3>Your free read will appear here.</h3>
                <p>
                  Section scores and status show here. Full detailed feedback, including recommendations,
                  is sent to your email.
                </p>
              </div>
            ) : (
              <>
                {/* Overall read */}
                <div className={`public-module-card free-overall-card free-overall-${result.overallRead.replace(" ", "-")}`}>
                  <p className="public-card-tag">Overall read</p>
                  <h3>{overallReadLabel(result.overallRead)}</h3>
                  <p>{result.executiveSummary}</p>
                  {result.slideCount ? <div className="public-card-note">{result.slideCount} slides detected</div> : null}
                </div>

                {/* Section scores, light version (on-screen) */}
                <div className="free-section-list">
                  <div className="free-section-list-header">
                    <span>Section</span>
                    <span>Status</span>
                    <span>Score</span>
                  </div>
                  {result.sectionFeedback.map((section) => (
                    <div className="free-section-row" key={section.key}>
                      <span className="free-section-row-label">{section.label}</span>
                      <span className={`free-status-pill free-status-${section.status}`}>
                        {statusLabel(section.status)}
                      </span>
                      <span className="free-section-score">
                        {section.score}<span className="free-section-score-denom">/5</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* Email nudge */}
                {capturedEmail ? (
                  <div className="free-email-sent-note">
                    <span className="free-email-sent-icon">✉</span>
                    Full feedback with section-by-section detail sent to <strong>{capturedEmail}</strong>
                  </div>
                ) : null}

                {/* Overall insights */}
                <div className="public-module-card">
                  <p className="public-card-tag">Key gaps</p>
                  <ul className="free-insight-list">
                    {result.overallInsights.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </div>

                {/* Upgrade CTA */}
                <div className="free-professional-cta">
                  <h3>Want to fix it?</h3>
                  <p>{result.professionalTeaser}</p>
                  <div className="free-upgrade-buttons">
                    <Link className="public-primary-button" to="/pricing">
                      Unlock full access
                    </Link>
                    <a
                      className="free-upgrade-link"
                      href={CALENDLY}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book a conversation with Todd
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
