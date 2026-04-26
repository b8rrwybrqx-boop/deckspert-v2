import { useState } from "react";
import { Link } from "react-router-dom";
import { postJson } from "../../src/api";
import { EmailGate, getStoredEmail } from "../../src/components/EmailGate";

type ArtifactKind = "pdf" | "pptx" | "text";

type SectionFeedback = {
  key: string;
  label: string;
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
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl });
  return { url: blob.url, pathname: blob.pathname, contentType: blob.contentType };
}

async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text() };
  }
  const blob = await uploadDocumentDirect(file);
  return { label: file.name, filename: file.name, contentType: blob.contentType || file.type, kind, sourceUrl: blob.url };
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

export default function FreeEvaluatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<FreeEvaluatorResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [capturedEmail, setCapturedEmail] = useState<string | null>(() => getStoredEmail());
  const [showEmailGate, setShowEmailGate] = useState(false);

  async function runEvaluation() {
    if (!file) return;

    setError("");
    setResult(null);
    setShowEmailGate(false);
    setIsSubmitting(true);
    setStatusMessage("");

    try {
      setStatusMessage(inferArtifactKind(file) === "text" ? "Preparing file..." : "Uploading deck...");
      const artifact = await buildArtifact(file);
      setStatusMessage("Evaluating story structure...");
      const response = await postJson<FreeEvaluatorResponse>("/api/free-evaluator", { artifacts: [artifact], notes });
      setResult(response);
      setStatusMessage("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Free evaluation failed.");
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEvaluate() {
    if (!file) {
      setError("Upload a PDF, PowerPoint, or text export to start.");
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
    void runEvaluation();
  }

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-hero-grid">
          <div>
            <p className="public-kicker">Free Evaluator</p>
            <h1>Upload a presentation for a quick story-structure read.</h1>
            <p className="public-hero-copy">
              Get feedback on the sections included, overall section strength, and deck-level story insights.
            </p>
          </div>
          <div className="public-hero-panel">
            <p className="public-panel-label">Free output</p>
            <ul className="public-panel-list">
              <li>Presentation ingestion</li>
              <li>Overall section feedback</li>
              <li>Deck-level insights</li>
              <li>Professional upgrade path</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner free-evaluator-layout">
          <div className="free-evaluator-form">
            <p className="public-kicker">Start</p>
            <h2>Run a free evaluation.</h2>
            <label className="field">
              <span className="metric-label">Presentation file</span>
              <input
                type="file"
                accept={acceptedTypes}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file ? <p className="helper-copy">Selected: {file.name}</p> : null}
            <label className="field">
              <span className="metric-label">Optional notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional: audience, meeting type, or anything useful for interpreting the deck."
              />
            </label>
            <button className="public-primary-button" type="button" onClick={handleEvaluate} disabled={isSubmitting}>
              {isSubmitting ? statusMessage || "Evaluating..." : "Evaluate deck"}
            </button>
            {statusMessage ? <p className="helper-copy">{statusMessage}</p> : null}
            {error ? <p className="delivery-error-text free-evaluator-error">{error}</p> : null}
          </div>

          <div className="free-evaluator-results">
            {showEmailGate ? (
              <EmailGate
                headline="Enter your email to see your story evaluation."
                subCopy="We'll send your results there. No spam. Unsubscribe anytime."
                submitLabel="See my story evaluation"
                source="free-evaluator"
                onSuccess={handleEmailCaptured}
              />
            ) : !result ? (
              <div className="public-module-card">
                <p className="public-card-tag">Result</p>
                <h3>Your free read will appear here.</h3>
                <p>
                  The free Evaluator focuses on story sections and overall deck insight. For deeper scoring,
                  slide-by-slide guidance, and team workflows, use Deckspert Professional.
                </p>
              </div>
            ) : (
              <>
                <div className="public-module-card">
                  <p className="public-card-tag">Overall read</p>
                  <h3>{result.overallRead}</h3>
                  <p>{result.executiveSummary}</p>
                  {result.slideCount ? <div className="public-card-note">{result.slideCount} slides detected</div> : null}
                </div>

                <div className="free-section-list">
                  {result.sectionFeedback.map((section) => (
                    <article className="free-section-card" key={section.key}>
                      <div>
                        <span className={`free-status-pill free-status-${section.status.replace(" ", "-")}`}>
                          {statusLabel(section.status)}
                        </span>
                        <h3>{section.label}</h3>
                      </div>
                      <p>{section.feedback}</p>
                      {section.evidence ? <small>Evidence: {section.evidence}</small> : null}
                    </article>
                  ))}
                </div>

                <div className="public-module-card">
                  <p className="public-card-tag">Overall insights</p>
                  <ul className="free-insight-list">
                    {result.overallInsights.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </div>

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
