import { useState } from "react";
import { sessionHeaders, useSessionProgram } from "../../src/session/SessionGate";
import { StarterDeckButton } from "../../src/session/StarterDeckButton";
import {
  TextEvaluatorPanel,
  ArtifactFields,
  nameClipboardFiles
} from "../../src/components/evaluator/StructuredEvaluator";
import logoAsset from "../../src/assets/logo.svg";

// The gated live-session tool. Everything structural lives in
// StructuredEvaluator, which the signed-in platform evaluator also mounts; this
// file supplies only what is specific to a room full of attendees working
// through a workshop: the passcode credential, the print identity on saved
// PDFs, and the upgrade CTA.
//
// This page carried its own copy of the evaluator panel until 2026-09-28.
// Please do not start a third one.

const SESSION_EMPTY_STATE =
  "Scored elements, flow notes, and prioritized fixes show on screen, instantly, right in the platform.";

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

type StepKey = "prep" | "storyboard" | "deck";

type Step = { key: StepKey; label: string; blurb: string };

/** Used until a program profile resolves, and as the base each profile overrides. */
// Order follows the method: prep, then the story, then the deck built from it.
// Presentation review is last because it reads a presentation that only exists
// once the deck does.
const DEFAULT_STEPS: Step[] = [
  { key: "prep", label: "1 · Proper Prep", blurb: "Pressure-test your prep worksheet before you build anything." },
  { key: "storyboard", label: "2 · Storyboard", blurb: "Check your narrative structure and flow before you make slides." },
  { key: "deck", label: "3 · Starter Deck", blurb: "Turn your storyboard into slides you can build on." }
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
            <p className="public-hero-copy">Use these tools live during today's session. Work through them in order: prep first, then your storyboard, then the deck you build from it.</p>
          </div>
        </section>

        <section className="public-section public-section-light">
          <div className="public-section-inner">
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
            {active.key === "deck" ? <StarterDeckPanel /> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
