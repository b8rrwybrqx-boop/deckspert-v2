import { useState } from "react";
import { upload } from "@vercel/blob/client";

// Shared structured (Proper Prep / Story Board) evaluator UI. Used by the gated
// session-material tool (session passcode auth) and the premium platform evaluator
// (logged-in user auth). The only difference is the endpoint + request headers, both
// injected via props, plus an optional upgrade CTA (shown in the session context only).

export type OverallRead = "strong" | "mixed" | "needs work";
export type Status = "present" | "weak" | "missing" | "unclear";
export type SectionFeedback = { key: string; label: string; score: number | null; status: Status; feedback: string };

export type StructuredResult = {
  title: string | null;
  overallRead: OverallRead;
  executiveSummary: string;
  sectionFeedback: SectionFeedback[];
  flowNotes?: string[];
  topFixes: string[];
  nextStep: string;
};

export type HeaderProvider = () => Promise<Record<string, string>> | Record<string, string>;
export type UpgradeCta = { copy: string } | null;

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";
export const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md";
export const MAX_FILE_MB = 25;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export function inferArtifactKind(file: File): "pdf" | "pptx" | "text" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  return "text";
}

export async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text(), fileSize: file.size };
  }
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload-token" });
  return { label: file.name, filename: file.name, contentType: blob.contentType || file.type, kind, sourceUrl: blob.url, fileSize: file.size };
}

export async function postWithHeaders<T>(url: string, payload: unknown, getHeaders: HeaderProvider): Promise<T> {
  const extra = await getHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch { /* keep fallback */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

const STATUS_LABELS: Record<Status, string> = { present: "Present", weak: "Weak", missing: "Missing", unclear: "Unclear" };
const OVERALL_LABELS: Record<OverallRead, string> = { strong: "Strong", mixed: "Mixed", "needs work": "Needs work" };

export function StructuredResultView({ result, upgradeCta }: { result: StructuredResult; upgradeCta?: UpgradeCta }) {
  return (
    <>
      <div className={`public-module-card free-overall-card free-overall-${result.overallRead.replace(" ", "-")}`}>
        <p className="public-card-tag">Overall read</p>
        <h3>{OVERALL_LABELS[result.overallRead]}</h3>
        <p>{result.executiveSummary}</p>
      </div>

      <div className="free-section-list">
        <div className="free-section-list-header">
          <span>Element</span><span>Status</span><span>Score</span>
        </div>
        {result.sectionFeedback.map((section) => (
          <div className="session-section-row" key={section.key}>
            <div className="session-section-row-top">
              <span className="free-section-row-label">{section.label}</span>
              <span className={`free-status-pill free-status-${section.status}`}>{STATUS_LABELS[section.status]}</span>
              {section.score == null ? (
                <span className="free-section-score-denom">n/a</span>
              ) : (
                <span className="free-section-score">{section.score}<span className="free-section-score-denom">/5</span></span>
              )}
            </div>
            <p className="session-section-feedback">{section.feedback}</p>
          </div>
        ))}
      </div>

      {result.flowNotes && result.flowNotes.length ? (
        <div className="public-module-card">
          <p className="public-card-tag">Flow &amp; discipline</p>
          <ul className="free-insight-list">{result.flowNotes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      ) : null}

      <div className="public-module-card">
        <p className="public-card-tag">Top fixes</p>
        <ul className="free-insight-list">{result.topFixes.map((f) => <li key={f}>{f}</li>)}</ul>
      </div>

      <div className="public-module-card">
        <p className="public-card-tag">Next step</p>
        <p>{result.nextStep}</p>
      </div>

      {upgradeCta ? (
        <div className="free-professional-cta">
          <h3>Keep going after today</h3>
          <p>{upgradeCta.copy}</p>
          <div className="free-upgrade-buttons">
            <a className="public-primary-button" href="/pricing">Get your own account</a>
            <a className="free-upgrade-link" href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a conversation with Todd</a>
          </div>
        </div>
      ) : null}
    </>
  );
}

export type TextEvaluatorPanelProps = {
  endpoint: string;
  getHeaders: HeaderProvider;
  titlePlaceholder: string;
  pastePlaceholder: string;
  runLabel: string;
  upgradeCta?: UpgradeCta;
};

export function TextEvaluatorPanel({ endpoint, getHeaders, titlePlaceholder, pastePlaceholder, runLabel, upgradeCta = null }: TextEvaluatorPanelProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StructuredResult | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");

  async function run() {
    setError(""); setResult(null); setIsRunning(true); setStatus("");
    try {
      let artifacts: unknown[] | undefined;
      if (file) {
        setStatus(inferArtifactKind(file) === "text" ? "Preparing file…" : "Uploading file…");
        artifacts = [await buildArtifact(file)];
      }
      setStatus("Evaluating…");
      const response = await postWithHeaders<StructuredResult>(endpoint, {
        title: title || undefined,
        notes,
        artifacts
      }, getHeaders);
      setResult(response);
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  function handleRun() {
    if (!notes.trim() && !file) {
      setError("Paste your content or upload a file to get feedback.");
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setError(`That file is over the ${MAX_FILE_MB} MB limit. Compress it or export a flatter PDF.`);
      return;
    }
    void run();
  }

  return (
    <div className="free-evaluator-layout">
      <div className="free-evaluator-form">
        <label className="field">
          <span className="metric-label">Title <span className="free-evaluator-limit-hint">optional</span></span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titlePlaceholder} />
        </label>
        <label className="field">
          <span className="metric-label">Paste your content</span>
          <textarea className="session-paste" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={pastePlaceholder} />
        </label>
        <label className="field">
          <span className="metric-label">Or upload a file <span className="free-evaluator-limit-hint">PDF / PPTX / text · max {MAX_FILE_MB} MB</span></span>
          <input type="file" accept={acceptedTypes} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
        </label>
        {file ? <p className="helper-copy">Selected: {file.name}</p> : null}
        <button className="public-primary-button" type="button" onClick={handleRun} disabled={isRunning}>
          {isRunning ? status || "Evaluating…" : runLabel}
        </button>
        {status && !isRunning ? <p className="helper-copy">{status}</p> : null}
        {error ? (
          <div className="free-evaluator-error-card">
            <p className="free-evaluator-error-title">Couldn't complete the evaluation</p>
            <p className="free-evaluator-error-body">{error}</p>
          </div>
        ) : null}
      </div>

      <div className="free-evaluator-results">
        {isRunning && !result ? (
          <div className="public-module-card">
            <p className="public-card-tag">Working…</p>
            <h3>Evaluating your content.</h3>
            <p>{status || "This takes a few seconds."}</p>
          </div>
        ) : !result ? (
          <div className="public-module-card">
            <p className="public-card-tag">Result</p>
            <h3>Your feedback will appear here.</h3>
            <p>Scored elements, flow notes, and prioritized fixes show on screen, instantly, right in the tool.</p>
          </div>
        ) : (
          <StructuredResultView result={result} upgradeCta={upgradeCta} />
        )}
      </div>
    </div>
  );
}
