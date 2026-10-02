import { useEffect, useState, type ReactNode } from "react";
import { upload } from "@vercel/blob/client";
import { SaveAsPdfButton } from "../SaveAsPdfButton";
import { WaitingFacts } from "../WaitingFacts";
import { statusLabel, type SectionStatus } from "../../../../../core/schemas/statusLabel";

// Shared structured (Proper Prep / Story Board) evaluator UI. Used by the gated
// session-material tool (session passcode auth) and the premium platform evaluator
// (logged-in user auth). The endpoint and request headers are injected via props,
// as are the differences between the two contexts: an upgrade CTA and a print
// header for the session tool, saved-report hydration for the platform.
//
// The session tool kept a near-verbatim copy of this file until 2026-09-28. The
// copy silently drifted (it never picked up heic/heif, so iPhone screenshots
// failed there and worked here) and every change had to be written twice. If a
// context needs to differ, add a prop rather than a second copy.

export type OverallRead = "strong" | "mixed" | "needs work";
export type Status = SectionStatus;
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
export const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif";
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

export async function buildArtifact(file: File, headers: Record<string, string>) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text(), fileSize: file.size };
  }
  // pdf / pptx / image all upload to blob; the backend reads images via vision.
  // The caller's credential rides along: /api/upload-token won't mint a blob
  // token without one.
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload-token", headers });
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

/** Stamped when a result lands, so it records the run rather than the print. */
export function today(): string {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Identifies a saved report. Print-only: on screen the page already says which
 * tool you are in, but a downloaded PDF carries none of that furniture and all
 * of these tools produce documents that look alike. Attendees keep them for
 * later workshops, so the label, subject and date are what make one
 * distinguishable months on.
 */
export function PrintReportHeader({ label, subject, date }: { label: string; subject?: string; date: string }) {
  return (
    <div className="print-only session-print-header">
      <p className="section-kicker">Deckspert · TPG Persuasive Storytelling</p>
      <h2>{label}</h2>
      {subject ? <p className="session-print-subject">{subject}</p> : null}
      <p className="session-print-date">{date}</p>
    </div>
  );
}

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
              <span className={`free-status-pill free-status-${section.status}`}>{statusLabel(section)}</span>
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
            <a className="public-primary-button" href="/connect#get-started">Get your own account</a>
            <a className="free-upgrade-link" href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a conversation with Todd</a>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Title, paste-or-screenshot, and file upload.
 *
 * Extracted so panels that are not the evaluator (the starter deck builder)
 * get the same input affordances. A bare textarea was shipped there once and
 * the first thing it cost was a facilitator pasting a screenshot of a
 * worksheet and having nothing happen.
 */
export function ArtifactFields({
  title, onTitle, titlePlaceholder, titleLabel = "Title",
  notes, onNotes, pastePlaceholder, pasteLabel = "Paste your content",
  files, onAddFiles, onRemoveFile
}: {
  title: string; onTitle: (v: string) => void; titlePlaceholder: string; titleLabel?: string;
  notes: string; onNotes: (v: string) => void; pastePlaceholder: string; pasteLabel?: string;
  files: File[]; onAddFiles: (f: File[]) => void; onRemoveFile: (i: number) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="metric-label">{titleLabel} <span className="free-evaluator-limit-hint">optional</span></span>
        <input type="text" value={title} onChange={(e) => onTitle(e.target.value)} placeholder={titlePlaceholder} />
      </label>
      <label className="field">
        <span className="metric-label">{pasteLabel} <span className="free-evaluator-limit-hint">text or a screenshot</span></span>
        <textarea
          className="session-paste"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          onPaste={(event) => {
            // A pasted screenshot arrives as a clipboard file; route it to the
            // attachment list. Plain text paste falls through to the default.
            const pasted = event.clipboardData?.files;
            if (pasted && pasted.length > 0) {
              event.preventDefault();
              onAddFiles(Array.from(pasted));
            }
          }}
          placeholder={pastePlaceholder}
        />
      </label>
      <label className="field">
        <span className="metric-label">Or upload files <span className="free-evaluator-limit-hint">PDF / PPTX / image / text \u00b7 max {MAX_FILE_MB} MB each</span></span>
        <input
          type="file"
          multiple
          accept={acceptedTypes}
          onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </label>
      {files.length ? (
        <ul className="evaluator-file-list">
          {files.map((selected, index) => (
            <li key={`${selected.name}-${index}`} className="evaluator-file-item">
              <span className="evaluator-file-name">{selected.name}</span>
              <button type="button" className="evaluator-file-remove" onClick={() => onRemoveFile(index)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Names a pasted clipboard image, which often arrives without one. */
export function nameClipboardFiles(incoming: File[]): File[] {
  return incoming.map((file, index) =>
    file.name ? file : new File([file], `pasted-image-${index + 1}.${file.type.split("/")[1] || "png"}`, { type: file.type })
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
  /**
   * Offer "Save as PDF" beneath a finished result. Opt-in because this panel is
   * also mounted by the session tool, whose page furniture has not been checked
   * against the print stylesheet.
   */
  allowSaveAsPdf?: boolean;
  /** Overrides the Save as PDF button label. */
  saveAsPdfLabel?: string;
  /**
   * When set, a print-only identity block is rendered above the result and
   * stamped with the run's title and date. The session tool needs this because
   * its PDFs are kept and compared after the workshop.
   */
  printReportLabel?: string;
  /** Headline shown while a run is in flight. */
  workingHeadline?: string;
  /** Typical run time, shown alongside the waiting facts to set expectations. */
  expectedSeconds?: number;
  /** Body copy for the empty result panel. */
  emptyStateBody?: string;
  /**
   * Rendered beneath a finished result. Receives what the attendee submitted,
   * because a follow-on action (building a starter deck from this storyboard)
   * needs the source content, not the scores. Kept as a render prop so the
   * panel does not have to know what any particular action does.
   */
  renderResultActions?: (submission: { title: string; notes: string; files: File[] }) => ReactNode;
  /**
   * Fires whenever the attendee's input changes, so a host page can carry that
   * work into a later step instead of asking them to paste it twice.
   */
  onSubmissionChange?: (submission: { title: string; notes: string; files: File[] }) => void;
  /**
   * Restores what the attendee had typed. A stepper unmounts the panel when it
   * moves to another step, so without this, walking to a later step and back
   * silently empties the box they pasted their work into.
   */
  initialDraft?: { title: string; notes: string; files: File[] };
  /** Reports a finished result so a host page can restore it on return. */
  onResultChange?: (result: StructuredResult | null) => void;
};

export function TextEvaluatorPanel({
  endpoint,
  getHeaders,
  titlePlaceholder,
  pastePlaceholder,
  runLabel,
  upgradeCta = null,
  reportId,
  savedResult = null,
  savedTitle = "",
  allowSaveAsPdf = false,
  saveAsPdfLabel,
  printReportLabel,
  workingHeadline = "Evaluating your content.",
  expectedSeconds,
  emptyStateBody = "Scored elements, flow notes, and prioritized fixes show on screen, instantly, right in the tool.",
  renderResultActions,
  onSubmissionChange,
  initialDraft,
  onResultChange
}: TextEvaluatorPanelProps) {
  const [title, setTitle] = useState(initialDraft?.title || savedTitle);
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [files, setFiles] = useState<File[]>(initialDraft?.files ?? []);
  const [result, setResult] = useState<StructuredResult | null>(savedResult);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  // Captured when the result lands rather than read at render, so editing the
  // title field afterwards cannot relabel a report that has already run.
  const [stamp, setStamp] = useState<{ subject: string; date: string } | null>(null);

  // Reported from an effect rather than the change handlers, so the parent's
  // state update never lands during this component's render.
  useEffect(() => {
    onSubmissionChange?.({ title, notes, files });
    // onSubmissionChange is intentionally not a dependency: a parent that
    // passes an inline arrow would otherwise re-fire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, notes, files]);

  function addFiles(incoming: File[]) {
    const named = nameClipboardFiles(incoming);
    if (!named.length) return;
    setError("");
    setFiles((current) => [...current, ...named]);
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function run() {
    setError(""); setResult(null); setStamp(null); setIsRunning(true); setStatus("");
    try {
      let artifacts: unknown[] | undefined;
      if (files.length) {
        const needsUpload = files.some((file) => inferArtifactKind(file) !== "text");
        setStatus(needsUpload ? "Uploading files…" : "Preparing files…");
        const uploadHeaders = await getHeaders();
        artifacts = await Promise.all(files.map((file) => buildArtifact(file, uploadHeaders)));
      }
      setStatus("Evaluating…");
      const response = await postWithHeaders<StructuredResult>(endpoint, {
        title: title || undefined,
        notes,
        artifacts,
        reportId
      }, getHeaders);
      setResult(response);
      onResultChange?.(response);
      setStamp({ subject: (response.title || title).trim(), date: today() });
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
        <ArtifactFields
          title={title}
          onTitle={setTitle}
          titlePlaceholder={titlePlaceholder}
          notes={notes}
          onNotes={setNotes}
          pastePlaceholder={pastePlaceholder}
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
        />
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
            <h3>{workingHeadline}</h3>
            <p>{status || "This takes about a minute."}</p>
            <WaitingFacts expectedSeconds={expectedSeconds} />
          </div>
        ) : !result ? (
          <div className="public-module-card">
            <p className="public-card-tag">Result</p>
            <h3>Your feedback will appear here.</h3>
            <p>{emptyStateBody}</p>
          </div>
        ) : (
          <>
            {printReportLabel ? (
              <PrintReportHeader label={printReportLabel} subject={stamp?.subject || undefined} date={stamp?.date ?? today()} />
            ) : null}
            <StructuredResultView result={result} upgradeCta={upgradeCta} />
            {renderResultActions ? renderResultActions({ title, notes, files }) : null}
            {allowSaveAsPdf ? <SaveAsPdfButton label={saveAsPdfLabel} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
