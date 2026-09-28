import { useEffect, useRef, useState } from "react";
import { sessionHeaders } from "./SessionGate";
import { postWithHeaders, StructuredResultView } from "../components/evaluator/StructuredEvaluator";
import { SaveAsPdfButton } from "../components/SaveAsPdfButton";
import type { StructuredResult } from "../components/evaluator/StructuredEvaluator";

// Module 4: hold your structure when an executive cuts across you.
//
// Typed rather than spoken, so a whole virtual room drills at once instead of
// one person at a time in front of everyone.

const ROUNDS = 5;
const SOFT_LIMIT_SECONDS = 60;

type Interruption = { round: number; kind: string; text: string; pressure: "mild" | "firm" | "hostile" };
type TurnScore = {
  round: number;
  heldStructure: number;
  answeredTheQuestion: number;
  reconnectedToRecommendation: number;
  showedJudgment: number;
  feedback: string;
  strongAnswer: string;
};
type Exchange = { interruption: Interruption; answer: string; elapsedSeconds?: number };
type TurnResponse = { score: TurnScore | null; next: Interruption | null; report: StructuredResult | null };

const STYLES = ["Director", "Thinker", "Relater", "Socializer"] as const;
type Style = (typeof STYLES)[number];

const STYLE_BLURB: Record<Style, string> = {
  Director: "Wants the ask now. Impatient with context.",
  Thinker: "Attacks the data and the method.",
  Relater: "Probes the people impact and the risk.",
  Socializer: "Derails you with a friendly tangent."
};

const DIMENSIONS: Array<[keyof TurnScore, string]> = [
  ["heldStructure", "Held the structure"],
  ["answeredTheQuestion", "Answered the question"],
  ["reconnectedToRecommendation", "Reconnected to the recommendation"],
  ["showedJudgment", "Showed judgment"]
];

/**
 * Counts up from when the interruption landed.
 *
 * Deliberately does NOT stop the attendee or submit for them. A hard cutoff in
 * a live room would discard whatever they were mid-sentence on, and the point
 * is to feel the clock, not to be punished by it. Past the soft limit it just
 * turns urgent and keeps counting.
 */
function Timer({ startedAt, onTick }: { startedAt: number; onTick: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      onTickRef.current(elapsed);
    }, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const over = seconds > SOFT_LIMIT_SECONDS;
  return (
    <p className="helper-copy" style={{ fontVariantNumeric: "tabular-nums", color: over ? "#B3261E" : undefined }}>
      {over ? "Over time: " : "Time: "}
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      {over ? " — an executive stopped listening a while ago." : ` of ${SOFT_LIMIT_SECONDS}s`}
    </p>
  );
}

export function InterruptionDrillPanel() {
  const [storyboard, setStoryboard] = useState("");
  const [style, setStyle] = useState<Style>("Director");
  const [name, setName] = useState("");

  const [transcript, setTranscript] = useState<Exchange[]>([]);
  const [current, setCurrent] = useState<Interruption | null>(null);
  const [answer, setAnswer] = useState("");
  const [lastScore, setLastScore] = useState<TurnScore | null>(null);
  const [report, setReport] = useState<StructuredResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const elapsedRef = useRef(0);

  const started = current !== null || report !== null;

  async function post(nextTranscript: Exchange[]) {
    setIsBusy(true);
    setError("");
    try {
      const response = await postWithHeaders<TurnResponse>(
        "/api/session-interruption-drill",
        { storyboard, persona: { style, name: name || undefined }, transcript: nextTranscript },
        sessionHeaders
      );
      setTranscript(nextTranscript);
      setLastScore(response.score);
      setCurrent(response.next);
      setReport(response.report);
      setAnswer("");
      if (response.next) setStartedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The drill could not continue.");
    } finally {
      setIsBusy(false);
    }
  }

  function start() {
    if (!storyboard.trim()) {
      setError("Paste your storyboard so the executive can interrupt you about your own material.");
      return;
    }
    setTranscript([]);
    setLastScore(null);
    setReport(null);
    void post([]);
  }

  function submitAnswer() {
    if (!current) return;
    void post([...transcript, { interruption: current, answer, elapsedSeconds: elapsedRef.current }]);
  }

  function reset() {
    setTranscript([]);
    setCurrent(null);
    setReport(null);
    setLastScore(null);
    setAnswer("");
    setError("");
  }

  const roundNumber = Math.min(transcript.length + 1, ROUNDS);

  return (
    <div className="free-evaluator-layout">
      <div className="free-evaluator-form">
        {!started ? (
          <>
            <label className="field">
              <span className="metric-label">Your storyboard</span>
              <textarea
                className="session-paste"
                value={storyboard}
                onChange={(e) => setStoryboard(e.target.value)}
                placeholder="Paste your storyboard. The executive interrupts you about your own numbers and claims, so a generic paste makes for a generic drill."
              />
            </label>
            <label className="field">
              <span className="metric-label">Who is interrupting you</span>
              <select value={style} onChange={(e) => setStyle(e.target.value as Style)}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s} — {STYLE_BLURB[s]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="metric-label">Their name <span className="free-evaluator-limit-hint">optional</span></span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. the CFO" />
            </label>
            <button className="public-primary-button" type="button" onClick={start} disabled={isBusy}>
              {isBusy ? "Starting…" : "Start the drill"}
            </button>
          </>
        ) : (
          <>
            <p className="public-card-tag">Round {roundNumber} of {ROUNDS}</p>
            {current ? (
              <>
                <div className={`public-module-card free-overall-card free-overall-${current.pressure === "hostile" ? "needs-work" : current.pressure === "firm" ? "mixed" : "strong"}`}>
                  <p className="public-card-tag">{name || style} interrupts</p>
                  <h3>{current.text}</h3>
                </div>
                <label className="field">
                  <span className="metric-label">Your answer</span>
                  <textarea
                    className="session-paste"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Answer them. Then get back to your point."
                    autoFocus
                  />
                </label>
                <Timer startedAt={startedAt} onTick={(s) => { elapsedRef.current = s; }} />
                <button className="public-primary-button" type="button" onClick={submitAnswer} disabled={isBusy || !answer.trim()}>
                  {isBusy ? "Scoring…" : roundNumber === ROUNDS ? "Answer and finish" : "Answer"}
                </button>
              </>
            ) : null}
            <button className="free-upgrade-link" type="button" onClick={reset} disabled={isBusy}>
              Start over
            </button>
          </>
        )}
        {error ? (
          <div className="free-evaluator-error-card">
            <p className="free-evaluator-error-title">Couldn't continue the drill</p>
            <p className="free-evaluator-error-body">{error}</p>
          </div>
        ) : null}
      </div>

      <div className="free-evaluator-results">
        {report ? (
          <>
            <StructuredResultView result={report} />
            <SaveAsPdfButton label="Download as PDF" />
          </>
        ) : lastScore ? (
          <>
            <div className="free-section-list">
              <div className="free-section-list-header"><span>Round {lastScore.round}</span><span /><span>Score</span></div>
              {DIMENSIONS.map(([key, label]) => (
                <div className="session-section-row" key={key}>
                  <div className="session-section-row-top">
                    <span className="free-section-row-label">{label}</span>
                    <span className="free-section-score">{lastScore[key] as number}<span className="free-section-score-denom">/5</span></span>
                  </div>
                </div>
              ))}
            </div>
            <div className="public-module-card">
              <p className="public-card-tag">On that answer</p>
              <p>{lastScore.feedback}</p>
            </div>
            <div className="public-module-card">
              <p className="public-card-tag">What a strong answer sounds like</p>
              <p>{lastScore.strongAnswer}</p>
            </div>
          </>
        ) : (
          <div className="public-module-card">
            <p className="public-card-tag">The drill</p>
            <h3>Five interruptions, escalating.</h3>
            <p>
              An executive cuts across your story. Answer them, then get back to your point. You are scored on
              whether you held the structure, answered what was actually asked, got back to your recommendation,
              and named what you are giving up.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
