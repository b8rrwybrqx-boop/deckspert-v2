import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { EmailGate, getStoredEmail } from "../../src/components/EmailGate";
import { MarkdownView } from "../../src/components/Markdown";
import { sessionHeaders } from "../../src/session/SessionGate";
import logoAsset from "../../src/assets/logo.svg";

// ── Shared types ──────────────────────────────────────────────────────────────

type OverallRead = "strong" | "mixed" | "needs work";
type Status = "present" | "weak" | "missing" | "unclear";

type SectionFeedback = { key: string; label: string; score: number; status: Status; feedback: string };

type StructuredResult = {
  title: string | null;
  overallRead: OverallRead;
  executiveSummary: string;
  sectionFeedback: SectionFeedback[];
  flowNotes?: string[];
  topFixes: string[];
  nextStep: string;
};

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";
const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md";
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// ── Artifact upload helpers (mirrors public/FreeEvaluator) ────────────────────

function inferArtifactKind(file: File): "pdf" | "pptx" | "text" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  return "text";
}

async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text(), fileSize: file.size };
  }
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload-token" });
  return { label: file.name, filename: file.name, contentType: blob.contentType || file.type, kind, sourceUrl: blob.url, fileSize: file.size };
}

async function postSession<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
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

// ── Display helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Status, string> = { present: "Present", weak: "Weak", missing: "Missing", unclear: "Unclear" };
const OVERALL_LABELS: Record<OverallRead, string> = { strong: "Strong", mixed: "Mixed", "needs work": "Needs work" };

function StructuredResultView({ result, ctaCopy }: { result: StructuredResult; ctaCopy: string }) {
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
              <span className="free-section-score">{section.score}<span className="free-section-score-denom">/5</span></span>
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

      <div className="free-professional-cta">
        <h3>Keep going after today</h3>
        <p>{ctaCopy}</p>
        <div className="free-upgrade-buttons">
          <a className="public-primary-button" href="/pricing">Get your own account</a>
          <a className="free-upgrade-link" href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a conversation with Todd</a>
        </div>
      </div>
    </>
  );
}

// ── Text-based evaluator panel (Prep + Storyboard) ────────────────────────────

type TextPanelProps = {
  endpoint: string;
  source: string;
  titlePlaceholder: string;
  pastePlaceholder: string;
  ctaCopy: string;
  runLabel: string;
};

function TextEvaluatorPanel({ endpoint, source, titlePlaceholder, pastePlaceholder, ctaCopy, runLabel }: TextPanelProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StructuredResult | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [capturedEmail, setCapturedEmail] = useState<string | null>(() => getStoredEmail());
  const [showEmailGate, setShowEmailGate] = useState(false);

  async function run(emailOverride?: string) {
    const emailToUse = emailOverride ?? capturedEmail;
    setError(""); setResult(null); setShowEmailGate(false); setIsRunning(true); setStatus("");
    try {
      let artifacts: unknown[] | undefined;
      if (file) {
        setStatus(inferArtifactKind(file) === "text" ? "Preparing file…" : "Uploading file…");
        artifacts = [await buildArtifact(file)];
      }
      setStatus("Evaluating…");
      const response = await postSession<StructuredResult>(endpoint, {
        title: title || undefined,
        notes,
        artifacts,
        email: emailToUse ?? undefined
      });
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
    if (!capturedEmail) { setShowEmailGate(true); return; }
    void run();
  }

  function handleEmailCaptured(email: string) {
    setCapturedEmail(email);
    void run(email);
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
        {showEmailGate ? (
          <EmailGate
            headline="Enter your email to see your feedback."
            subCopy="We'll send a copy there too, so you can keep it after the session."
            submitLabel="See my feedback"
            source={source}
            onSuccess={handleEmailCaptured}
          />
        ) : !result ? (
          <div className="public-module-card">
            <p className="public-card-tag">Result</p>
            <h3>Your feedback will appear here.</h3>
            <p>Scored elements, flow notes, and prioritized fixes show on screen — and land in your inbox.</p>
          </div>
        ) : (
          <>
            {capturedEmail ? (
              <div className="free-email-sent-note"><span className="free-email-sent-icon">✉</span> A copy was sent to <strong>{capturedEmail}</strong></div>
            ) : null}
            <StructuredResultView result={result} ctaCopy={ctaCopy} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Presentation panel (full platform-grade evaluation) ───────────────────────

function PresentationPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [phase1, setPhase1] = useState<string | null>(null);
  const [phase2, setPhase2] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<unknown | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [capturedEmail, setCapturedEmail] = useState<string | null>(() => getStoredEmail());
  const [showEmailGate, setShowEmailGate] = useState(false);

  async function runPhase1(emailOverride?: string) {
    if (!file) return;
    const emailToUse = emailOverride ?? capturedEmail;
    setError(""); setPhase1(null); setPhase2(null); setShowEmailGate(false); setIsRunning(true);
    try {
      setStatus(inferArtifactKind(file) === "text" ? "Preparing file…" : "Uploading deck…");
      const built = await buildArtifact(file);
      setArtifact(built);
      setStatus("Analyzing your story… this can take a minute.");
      const res = await postSession<{ markdown: string }>("/api/session-presentation-evaluator", {
        artifacts: [built], notes, phase: 1, email: emailToUse ?? undefined, filename: file.name
      });
      setPhase1(res.markdown);
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  async function runPhase2() {
    if (!artifact || !phase1) return;
    setError(""); setPhase2(null); setIsRunning(true); setStatus("Running slide-by-slide review…");
    try {
      const res = await postSession<{ markdown: string }>("/api/session-presentation-evaluator", {
        artifacts: [artifact], notes, phase: 2, priorOutput: phase1, filename: file?.name
      });
      setPhase2(res.markdown);
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slide-by-slide evaluation failed.");
      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  function handleRun() {
    if (!file) { setError("Select a PDF, PowerPoint, or text file to evaluate."); return; }
    if (file.size > MAX_FILE_BYTES) { setError(`That file is over the ${MAX_FILE_MB} MB limit. Compress it or export a flatter PDF.`); return; }
    if (!capturedEmail) { setShowEmailGate(true); return; }
    void runPhase1();
  }

  return (
    <div className="free-evaluator-layout">
      <div className="free-evaluator-form">
        <label className="field">
          <span className="metric-label">Presentation file <span className="free-evaluator-limit-hint">PDF / PPTX · max {MAX_FILE_MB} MB</span></span>
          <input type="file" accept={acceptedTypes} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPhase1(null); setPhase2(null); setError(""); }} />
        </label>
        {file ? <p className="helper-copy">Selected: {file.name}</p> : null}
        <label className="field">
          <span className="metric-label">Context <span className="free-evaluator-limit-hint">optional</span></span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Audience, meeting type, objective, or anything useful for interpreting the deck." />
        </label>
        <button className="public-primary-button" type="button" onClick={handleRun} disabled={isRunning}>
          {isRunning ? status || "Evaluating…" : "Evaluate presentation"}
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
        {showEmailGate ? (
          <EmailGate
            headline="Enter your email to see your evaluation."
            subCopy="We'll send a copy there too, so you can keep it after the session."
            submitLabel="See my evaluation"
            source="session-presentation"
            onSuccess={(email) => { setCapturedEmail(email); void runPhase1(email); }}
          />
        ) : !phase1 ? (
          <div className="public-module-card">
            <p className="public-card-tag">Result</p>
            <h3>Your full evaluation will appear here.</h3>
            <p>A scored, section-by-section read of your story — the same engine paying customers use.</p>
          </div>
        ) : (
          <>
            {capturedEmail ? (
              <div className="free-email-sent-note"><span className="free-email-sent-icon">✉</span> A copy was sent to <strong>{capturedEmail}</strong></div>
            ) : null}
            <div className="card surface-card platform-evaluator-result-card">
              <p className="section-kicker">Story Analysis</p>
              <MarkdownView markdown={phase1} />
            </div>
            {!phase2 && !isRunning ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                <button className="public-primary-button" type="button" onClick={() => void runPhase2()}>Run slide-by-slide evaluation</button>
              </div>
            ) : null}
            {phase2 ? (
              <div className="card surface-card platform-evaluator-result-card">
                <p className="section-kicker">Slide-by-Slide Evaluation</p>
                <MarkdownView markdown={phase2} />
              </div>
            ) : null}
            <div className="free-professional-cta">
              <h3>Keep going after today</h3>
              <p>Your session access expires after the workshop. Get your own account to keep evaluating, building, and coaching your stories.</p>
              <div className="free-upgrade-buttons">
                <a className="public-primary-button" href="/pricing">Get your own account</a>
                <a className="free-upgrade-link" href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a conversation with Todd</a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page shell + stepper ──────────────────────────────────────────────────────

type StepKey = "prep" | "storyboard" | "presentation";

const STEPS: Array<{ key: StepKey; label: string; blurb: string }> = [
  { key: "prep", label: "1 · Proper Prep", blurb: "Pressure-test your prep worksheet before you build anything." },
  { key: "storyboard", label: "2 · Storyboard", blurb: "Check your narrative structure and flow before you make slides." },
  { key: "presentation", label: "3 · Presentation", blurb: "Get a full scored evaluation of your finished deck." }
];

export default function SessionMaterialPage() {
  const [step, setStep] = useState<StepKey>("prep");
  const active = STEPS.find((s) => s.key === step)!;

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-brand">
          <img src={logoAsset} alt="TPG" className="public-brand-logo" />
          <div className="public-brand-text"><span>Deckspert</span><strong>Live Session</strong></div>
        </div>
        <a className="public-methodology-link" href="https://tpgpersuasivestorytelling.com/">TPG Persuasive Storytelling</a>
      </header>

      <main>
        <section className="public-hero public-hero-compact">
          <div className="public-section-inner">
            <p className="public-kicker">Session Tools</p>
            <h1>Build a stronger story, one stage at a time.</h1>
            <p className="public-hero-copy">Use these tools live during today's session. Work through them in order — prep, then storyboard, then your full presentation.</p>
          </div>
        </section>

        <section className="public-section public-section-light">
          <div className="public-section-inner">
            <div className="session-stepper">
              {STEPS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`session-step${s.key === step ? " active" : ""}`}
                  onClick={() => setStep(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="session-step-blurb">{active.blurb}</p>

            {step === "prep" ? (
              <TextEvaluatorPanel
                endpoint="/api/session-prep-evaluator"
                source="session-prep"
                titlePlaceholder="e.g. Q3 Walmart category review"
                pastePlaceholder="Paste your Proper Prep worksheet — audience, desired outcome, situation, root cause, Big Idea, WIIFM, proof points…"
                ctaCopy="This is the same coaching Deckspert gives paying users. Keep it after the session with your own account."
                runLabel="Evaluate my prep"
              />
            ) : null}
            {step === "storyboard" ? (
              <TextEvaluatorPanel
                endpoint="/api/session-storyboard-evaluator"
                source="session-storyboard"
                titlePlaceholder="e.g. Q3 Walmart category review"
                pastePlaceholder="Paste your storyboard, section by section — Opening Gambit, Desired Outcome, Situation/Root Cause, Big Idea, How It Works, WIIFM, Close, Actions…"
                ctaCopy="Deckspert can also help you generate and refine storyboards. Keep building with your own account."
                runLabel="Evaluate my storyboard"
              />
            ) : null}
            {step === "presentation" ? <PresentationPanel /> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
