import { useState } from "react";
import { MarkdownView } from "../../src/components/Markdown";
import { SaveAsPdfButton } from "../../src/components/SaveAsPdfButton";
import { sessionHeaders, useSessionProgram } from "../../src/session/SessionGate";
import { StarterDeckButton } from "../../src/session/StarterDeckButton";
import {
  TextEvaluatorPanel,
  ArtifactFields,
  nameClipboardFiles,
  PrintReportHeader,
  buildArtifact,
  inferArtifactKind,
  postWithHeaders,
  today,
  MAX_FILE_MB,
  MAX_FILE_BYTES
} from "../../src/components/evaluator/StructuredEvaluator";
import logoAsset from "../../src/assets/logo.svg";

// The gated live-session tool. Everything structural lives in
// StructuredEvaluator, which the premium platform evaluator also mounts; this
// file supplies only what is specific to a room full of attendees working
// through a workshop: the passcode credential, the print identity on saved
// PDFs, the upgrade CTA, and the presentation panel's two-phase run.
//
// This page carried its own copy of the evaluator panel until 2026-09-28.
// Please do not start a third one.

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";
/** Lands on the contact form rather than the top of the Connect page. */
const FULL_ACCESS_LINK = "/connect#get-started";
/** Presentation decks are documents only; a screenshot is not a deck. */
const presentationTypes = ".pdf,.ppt,.pptx,.txt,.md";

const EXPIRY_COPY =
  "Your session access expires after the workshop. Get your own account to keep evaluating, building, and coaching your stories.";

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
  const [stamp, setStamp] = useState<{ subject: string; date: string } | null>(null);

  async function runPhase1() {
    if (!file) return;
    setError(""); setPhase1(null); setPhase2(null); setStamp(null); setIsRunning(true);
    try {
      setStatus(inferArtifactKind(file) === "text" ? "Preparing file…" : "Uploading deck…");
      const built = await buildArtifact(file, sessionHeaders());
      setArtifact(built);
      setStatus("Analyzing your story… this can take a minute.");
      const res = await postWithHeaders<{ markdown: string }>("/api/session-presentation-evaluator", {
        artifacts: [built], notes, phase: 1, filename: file.name
      }, sessionHeaders);
      setPhase1(res.markdown);
      setStamp({ subject: file.name, date: today() });
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
      const res = await postWithHeaders<{ markdown: string }>("/api/session-presentation-evaluator", {
        artifacts: [artifact], notes, phase: 2, priorOutput: phase1, filename: file?.name
      }, sessionHeaders);
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
    void runPhase1();
  }

  return (
    <div className="session-presentation">
      <div className="free-evaluator-form session-presentation-form">
        <label className="field">
          <span className="metric-label">Presentation file <span className="free-evaluator-limit-hint">PDF / PPTX · max {MAX_FILE_MB} MB</span></span>
          <input type="file" accept={presentationTypes} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPhase1(null); setPhase2(null); setError(""); }} />
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

      <div className="session-presentation-results">
        {isRunning && !phase1 ? (
          <div className="public-module-card">
            <p className="public-card-tag">Working…</p>
            <h3>Evaluating your presentation.</h3>
            <p>{status || "This can take a minute."}</p>
          </div>
        ) : !phase1 ? (
          <div className="public-module-card">
            <p className="public-card-tag">Result</p>
            <h3>Your full evaluation will appear here.</h3>
            <p>A scored, section-by-section read of your story, the same engine paying customers use.</p>
          </div>
        ) : (
          <>
            <PrintReportHeader label="Presentation Evaluation" subject={stamp?.subject || undefined} date={stamp?.date ?? today()} />
            <div className="card surface-card platform-evaluator-result-card">
              <p className="section-kicker">Story Analysis</p>
              <MarkdownView markdown={phase1} />
            </div>
            {!phase2 ? (
              <div className="session-phase2-actions">
                <button className="public-primary-button" type="button" onClick={() => void runPhase2()} disabled={isRunning}>
                  {isRunning ? "Running slide by slide review…" : "Run compelling content slide by slide design evaluation"}
                </button>
              </div>
            ) : null}
            {phase2 ? (
              <div className="card surface-card platform-evaluator-result-card">
                <p className="section-kicker">Slide-by-Slide Evaluation</p>
                <MarkdownView markdown={phase2} />
              </div>
            ) : null}
            <SaveAsPdfButton label="Download as PDF" />
            <div className="free-professional-cta">
              <h3>Keep going after today</h3>
              <p>{EXPIRY_COPY}</p>
              <div className="free-upgrade-buttons">
                <a className="public-primary-button" href={FULL_ACCESS_LINK}>Get your own account</a>
                <a className="free-upgrade-link" href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a conversation with Todd</a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Starter deck (standalone) ─────────────────────────────────────────────────

/**
 * Paste a storyboard, get a deck, without running the scoring check first.
 *
 * Plenty of teams draft in the Word worksheet and never touch the Storyboard
 * step; making the deck reachable only from a finished evaluation would lock
 * them out of the one artifact they actually need.
 */
function StarterDeckPanel() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  function addFiles(incoming: File[]) {
    const named = nameClipboardFiles(incoming);
    if (named.length) setFiles((current) => [...current, ...named]);
  }

  return (
    <div className="free-evaluator-layout">
      <div className="free-evaluator-form">
        <ArtifactFields
          title={title}
          onTitle={setTitle}
          titlePlaceholder="e.g. Trilogy complexity audit"
          notes={notes}
          onNotes={setNotes}
          pasteLabel="Paste your storyboard"
          pastePlaceholder="Paste your completed planning worksheet, box by box, or paste a screenshot of it. Your own words are what end up on the slides."
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={(i) => setFiles((current) => current.filter((_, index) => index !== i))}
        />
      </div>
      <div className="free-evaluator-results">
        <StarterDeckButton submission={{ title, notes, files }} />
      </div>
    </div>
  );
}

// ── Page shell + stepper ──────────────────────────────────────────────────────

type StepKey = "prep" | "storyboard" | "deck" | "presentation";

type Step = { key: StepKey; label: string; blurb: string };

/** Used until a program profile resolves, and as the base each profile overrides. */
// Order follows the method: prep, then the story, then the deck built from it.
// Presentation review is last because it reads a presentation that only exists
// once the deck does.
const DEFAULT_STEPS: Step[] = [
  { key: "prep", label: "1 · Proper Prep", blurb: "Pressure-test your prep worksheet before you build anything." },
  { key: "storyboard", label: "2 · Storyboard", blurb: "Check your narrative structure and flow before you make slides." },
  { key: "deck", label: "3 · Starter Deck", blurb: "Turn your storyboard into slides you can build on." },
  { key: "presentation", label: "4 · Presentation Review", blurb: "Optional. Bring back the deck you built and get a full scored read of it." }
];

/**
 * The stepper for the active program.
 *
 * A profile can switch tools off and rename the rest, so a client's page says
 * what their own workshop deck says. Falls back to the full default set when no
 * profile has resolved, so the page is never empty while it recovers one.
 */
function stepsForProfile(
  tools: readonly string[] | undefined,
  overrides: Partial<Record<string, { label: string; blurb: string }>> | undefined
): Step[] {
  const enabled = tools?.length ? DEFAULT_STEPS.filter((s) => tools.includes(s.key)) : DEFAULT_STEPS;
  const steps = enabled.length ? enabled : DEFAULT_STEPS;
  return steps.map((step) => {
    const override = overrides?.[step.key];
    return override ? { ...step, ...override } : step;
  });
}

/** Copy that differs per step; everything else comes from the shared panel. */
const SESSION_EMPTY_STATE =
  "Scored elements, flow notes, and prioritized fixes show on screen, instantly, right in the platform.";

export default function SessionMaterialPage() {
  const program = useSessionProgram();
  const steps = stepsForProfile(program?.tools, program?.steps);
  const [step, setStep] = useState<StepKey>("prep");
  // The selected step may not be one this program offers, either because the
  // profile resolved after first paint or because that tool is switched off.
  const active = steps.find((s) => s.key === step) ?? steps[0];

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
            <p className="public-hero-copy">Use these tools live during today's session. Work through them in order: prep first, then storyboard, then your full presentation.</p>
          </div>
        </section>

        <section className="public-section public-section-light">
          <div className={`public-section-inner${active.key === "presentation" ? " session-wide" : ""}`}>
            <div className="session-stepper">
              {steps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`session-step${s.key === active.key ? " active" : ""}`}
                  onClick={() => setStep(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="session-step-blurb">{active.blurb}</p>

            {active.key === "prep" ? (
              <TextEvaluatorPanel
                endpoint="/api/session-prep-evaluator"
                getHeaders={sessionHeaders}
                titlePlaceholder="e.g. Q3 Walmart category review"
                pastePlaceholder="Paste your Proper Prep worksheet: audience, behavioral style and position, core / business / personal needs, desired outcome, reasons to say yes, reasons to say no."
                runLabel="Evaluate my prep"
                workingHeadline="Evaluating your prep."
                emptyStateBody={SESSION_EMPTY_STATE}
                printReportLabel="Proper Prep Evaluation"
                allowSaveAsPdf
                saveAsPdfLabel="Download as PDF"
                upgradeCta={{ copy: "This is the same coaching Deckspert gives paying users. Keep it after the session with your own account." }}
              />
            ) : null}
            {active.key === "storyboard" ? (
              <TextEvaluatorPanel
                endpoint="/api/session-storyboard-evaluator"
                getHeaders={sessionHeaders}
                titlePlaceholder="e.g. Q3 Walmart category review"
                pastePlaceholder="Paste your storyboard, section by section: Opening Gambit, Desired Outcome, Situation/Root Cause, Big Idea, How It Works, WIIFM, Close, Actions."
                runLabel="Evaluate my storyboard"
                workingHeadline="Evaluating your storyboard."
                emptyStateBody={SESSION_EMPTY_STATE}
                printReportLabel="Storyboard Evaluation"
                allowSaveAsPdf
                saveAsPdfLabel="Download as PDF"
                upgradeCta={{ copy: "Deckspert can also help you generate and refine storyboards. Keep building with your own account." }}
                renderResultActions={(submission) => <StarterDeckButton submission={submission} />}
              />
            ) : null}
            {active.key === "presentation" ? <PresentationPanel /> : null}
            {active.key === "deck" ? <StarterDeckPanel /> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
