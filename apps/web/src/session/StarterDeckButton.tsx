import { useState } from "react";
import { sessionHeaders } from "./SessionGate";
import {
  buildArtifact,
  inferArtifactKind,
  postWithHeaders
} from "../components/evaluator/StructuredEvaluator";
import { WaitingFacts } from "../components/WaitingFacts";

// "Download starter deck": turns a written storyboard into a low-fidelity .pptx.
//
// The deck is scaffolding, and the button says so. An attendee who mistakes it
// for a finished presentation has been failed by this component, not by the
// renderer.

type DeckWarning = { slideIndex: number; field: string; message: string };

type DeckResponse = {
  filename: string;
  slideCount: number;
  warnings: DeckWarning[];
  deckTitle: string;
  pptxBase64: string;
};

/**
 * Hands the file to the browser.
 *
 * The .pptx arrives base64 in JSON so the render warnings can travel with it,
 * so it is decoded here rather than being a plain download link.
 */
function saveDeck(response: DeckResponse) {
  const binary = atob(response.pptxBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = response.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on a later tick: Safari cancels an in-flight download if the object
  // URL is released synchronously after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type StarterDeckSubmission = { title: string; notes: string; files: File[] };

export function StarterDeckButton({ submission }: { submission: StarterDeckSubmission }) {
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeckResponse | null>(null);

  async function build() {
    setError("");
    setResult(null);
    setIsBuilding(true);
    try {
      const artifacts = submission.files.length
        ? await Promise.all(
            submission.files
              .filter((file) => inferArtifactKind(file) !== "text" || file.size > 0)
              .map((file) => buildArtifact(file, sessionHeaders()))
          )
        : undefined;

      const response = await postWithHeaders<DeckResponse>(
        "/api/session-starter-deck",
        { title: submission.title || undefined, notes: submission.notes, artifacts },
        sessionHeaders
      );
      saveDeck(response);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the starter deck.");
    } finally {
      setIsBuilding(false);
    }
  }

  const hasContent = Boolean(submission.notes.trim() || submission.files.length);

  return (
    <div className="public-module-card">
      <p className="public-card-tag">Starter deck</p>
      <h3>Turn this storyboard into slides.</h3>
      <p>
        A plain PowerPoint built from your own words, one slide per box, with coaching in the speaker
        notes. It is a starting structure to build on, not a finished deck.
      </p>
      <button
        className="public-primary-button"
        type="button"
        onClick={() => void build()}
        disabled={isBuilding || !hasContent}
      >
        {isBuilding ? "Building your deck…" : "Download starter deck"}
      </button>
      {!hasContent ? <p className="helper-copy">Paste your storyboard first.</p> : null}
      {/* 48s and 61s in production on 2026-10-06, for Marmon and tpg-default:
          the build reads only section names, so the program barely matters. */}
      {isBuilding ? <WaitingFacts expectedSeconds={60} /> : null}

      {result ? (
        <>
          <p className="helper-copy">
            {result.slideCount} slides downloaded as {result.filename}.
          </p>
          {result.warnings.length ? (
            <div className="free-evaluator-error-card">
              <p className="free-evaluator-error-title">Trimmed to fit</p>
              <ul className="free-insight-list">
                {result.warnings.map((w) => (
                  <li key={`${w.slideIndex}-${w.field}-${w.message}`}>
                    Slide {w.slideIndex}, {w.field}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <div className="free-evaluator-error-card">
          <p className="free-evaluator-error-title">Couldn't build the deck</p>
          <p className="free-evaluator-error-body">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
