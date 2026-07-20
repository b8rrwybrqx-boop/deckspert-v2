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
export const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif";
export const MAX_FILE_MB = 25;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"];

export function inferArtifactKind(file: File): "pdf" | "pptx" | "image" | "text" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  if ((ext && IMAGE_EXTENSIONS.includes(ext)) || file.type.startsWith("image/")) return "image";
  return "text";
}

export async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text(), fileSize: file.size };
  }
  // pdf / pptx / image all upload to blob; the backend reads images via vision.
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
  /**
   * When set, the run is saved under this id so it shows up in Recent Work and
   * can be reopened. Optional so an unauthenticated caller (the session tool
   * has no user to save against) can mount this panel and stay ephemeral.
   */
  reportId?: string;
  /** A previously saved run, rendered immediately on reopen. */
  savedResult?: StructuredResult | null;
  /** Title of the saved run, so the field is populated when re-running. */
  savedTitle?: string;
};

export function TextEvaluatorPanel({ endpoint, getHeaders, titlePlaceholder, pastePlaceholder, runLabel, upgradeCta = null, reportId, savedResult = null, savedTitle = "" }: TextEvaluatorPanelProps) {
  const [title, setTitle] = useState(savedTitle);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<StructuredResult | null>(savedResult);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");

  function addFiles(incoming: File[]) {
    // Give pasted clipboard images a stable name (some browsers leave it blank).
    const named = incoming.map((file, index) =>
      file.name ? file : new File([file], `pasted-image-${index + 1}.${file.type.split("/")[1] || "png"}`, { type: file.type })
    );
    if (!named.length) return;
    setError("");
    setFiles((current) => [...current, ...named]);
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function run() {
    setError(""); setResult(null); setIsRunning(true); setStatus("");
    try {
      let artifacts: unknown[] | undefined;
      if (files.length) {
        const needsUpload = files.some((file) => inferArtifactKind(file) !== "text");
        setStatus(needsUpload ? "Uploading files…" : "Preparing files…");
        artifacts = await Promise.all(files.map(buildArtifact));
      }
      setStatus("Evaluating…");
      const response = await postWithHeaders<StructuredResult>(endpoint, {
        title: title || undefined,
        notes,
        artifacts,
        reportId
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
    if (!notes.trim() && !files.length) {
      setError("Paste your content, paste a screenshot, or upload a file to get feedback.");
      return;
    }
    const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is over the ${MAX_FILE_MB} MB limit. Compress it or export a flatter file.`);
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
          <span className="metric-label">Paste your content <span className="free-evaluator-limit-hint">text or a screenshot</span></span>
          <textarea
            className="session-paste"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onPaste={(event) => {
              // A pasted screenshot arrives as a clipboard file; route it to the
              // attachment list. Plain text paste falls through to the default.
              const pasted = event.clipboardData?.files;
              if (pasted && pasted.length > 0) {
                event.preventDefault();
                addFiles(Array.from(pasted));
              }
            }}
            placeholder={pastePlaceholder}
          />
        </label>
        <label className="field">
          <span className="metric-label">Or upload files <span className="free-evaluator-limit-hint">PDF / PPTX / image / text · max {MAX_FILE_MB} MB each</span></span>
          <input
            type="file"
            multiple
            accept={acceptedTypes}
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </label>
        {files.length ? (
          <ul className="evaluator-file-list">
            {files.map((selected, index) => (
              <li key={`${selected.name}-${index}`} className="evaluator-file-item">
                <span className="evaluator-file-name">{selected.name}</span>
                <button type="button" className="evaluator-file-remove" onClick={() => removeFile(index)}>Remove</button>
              </li>
            ))}
          </ul>
        ) : null}
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
