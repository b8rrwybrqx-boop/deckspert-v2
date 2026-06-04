import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { useAuth } from "../../src/auth/useAuth";
import { TextEvaluatorPanel } from "../../src/components/evaluator/StructuredEvaluator";

type ArtifactKind = "pdf" | "pptx" | "text";

const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md";

// Progress step definitions, threshold is the % at which the step becomes "active"
const PHASE1_STEPS = [
  { key: "uploading",  label: "Uploading",        threshold: 0  },
  { key: "converting", label: "Converting slides", threshold: 14 },
  { key: "analyzing",  label: "Analyzing",         threshold: 64 },
  { key: "complete",   label: "Complete",          threshold: 99 },
] as const;

const PHASE2_STEPS = [
  { key: "extracting", label: "Extracting text",  threshold: 0  },
  { key: "analyzing",  label: "Analyzing slides", threshold: 20 },
  { key: "compiling",  label: "Compiling report", threshold: 70 },
  { key: "complete",   label: "Complete",         threshold: 99 },
] as const;

function inferArtifactKind(file: File): ArtifactKind {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  return "text";
}

async function uploadFileDirect(
  file: File,
  handleUploadUrl = "/api/upload-token"
): Promise<{ url: string; contentType: string }> {
  const blob = await upload(file.name, file, { access: "public", handleUploadUrl });
  return { url: blob.url, contentType: blob.contentType };
}

async function buildArtifact(file: File) {
  const kind = inferArtifactKind(file);
  if (kind === "text") {
    return { label: file.name, filename: file.name, contentType: file.type || "text/plain", kind, content: await file.text() };
  }
  const blob = await uploadFileDirect(file);
  return { label: file.name, filename: file.name, contentType: blob.contentType || file.type, kind, sourceUrl: blob.url };
}

// ── Score summary ─────────────────────────────────────────────────────────────

const KNOW_SECTIONS = ["title slide", "opening gambit", "desired outcome"];
const BELIEVE_SECTIONS = ["situation / root cause", "situation/root cause", "big idea", "how it works"];
const DO_SECTIONS = ["wiifm", "close", "actions & next steps", "actions and next steps"];

function normKey(s: string) {
  return s.replace(/[*_`]/g, "").toLowerCase().trim();
}

function extractScore(cell: string): number | null {
  // Strip markdown formatting, then find a standalone digit 1–5
  const clean = cell.replace(/[*_`]/g, "").trim();
  const m = clean.match(/\b([1-5])\b/);
  return m ? parseInt(m[1], 10) : null;
}

function parseSectionScores(md: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const line of md.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const key = normKey(cells[0]);
    // Skip header/separator rows (key is all dashes, "element", "#", or empty)
    if (!key || /^[-#]+$/.test(key) || key === "element") continue;
    const score = extractScore(cells[1]);
    if (score !== null) {
      scores[key] = score;
    }
  }
  return scores;
}

function avgOf(scores: Record<string, number>, keys: string[]): number | null {
  const vals = keys.map(k => scores[k]).filter((v): v is number => v !== undefined);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="delivery-score-card">
      <p className="delivery-score-label">{label}</p>
      <p className="delivery-score-value">{value}</p>
      <p className="delivery-score-scale">out of 5</p>
    </div>
  );
}

function EvalScoreSummary({ markdown }: { markdown: string }) {
  const scores = parseSectionScores(markdown);

  // avgOf now works directly on the same normalised keys stored in scores
  const know = avgOf(scores, KNOW_SECTIONS);
  const believe = avgOf(scores, BELIEVE_SECTIONS);
  const doScore = avgOf(scores, DO_SECTIONS);

  const allVals = Object.values(scores).filter((v): v is number => typeof v === "number");
  const overall = allVals.length
    ? Math.round((allVals.reduce((s, v) => s + v, 0) / allVals.length) * 10) / 10
    : null;

  if (overall === null) return null;

  return (
    <div className="delivery-score-grid">
      <ScoreCard label="Overall Story" value={overall} />
      <ScoreCard label="Setup & Context" value={know} />
      <ScoreCard label="Core Argument" value={believe} />
      <ScoreCard label="Persuasion & Close" value={doScore} />
    </div>
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────────────

type InlineNode = string | { bold: string } | { em: string };

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push({ bold: match[1] });
    else if (match[2] !== undefined) nodes.push({ em: match[2] });
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function InlineContent({ text }: { text: string }) {
  const nodes = parseInline(text);
  return (
    <>
      {nodes.map((node, i) => {
        if (typeof node === "string") return <span key={i}>{node}</span>;
        if ("bold" in node) return <strong key={i}>{node.bold}</strong>;
        if ("em" in node) return <em key={i}>{node.em}</em>;
        return null;
      })}
    </>
  );
}

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "p"; text: string }
  | { type: "blank" };

function parseMarkdown(md: string): Block[] {
  const rawLines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }

    // Table: line contains | and next line looks like separator
    if (line.includes("|") && i + 1 < rawLines.length && /^\s*\|?\s*[-:]+/.test(rawLines[i + 1])) {
      const headers = line.split("|").map(h => h.trim()).filter(Boolean);
      i += 2; // skip separator row
      const rows: string[][] = [];
      while (i < rawLines.length && rawLines[i].includes("|")) {
        const cells = rawLines[i].split("|").map(c => c.trim()).filter(Boolean);
        rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // List item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [line.slice(2).trim()];
      i++;
      while (i < rawLines.length && (rawLines[i].startsWith("- ") || rawLines[i].startsWith("* "))) {
        items.push(rawLines[i].slice(2).trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ type: "blank" });
      i++;
      continue;
    }

    blocks.push({ type: "p", text: line.trim() });
    i++;
  }

  return blocks;
}

/**
 * Renders table cell content that may contain bullet lists.
 * Handles two formats:
 *   • Unicode bullet: "• item1 • item2" or "• item1\n• item2"
 *   • Markdown dash:  "- item1\n- item2"
 * Falls back to plain InlineContent when no bullets are present.
 */
function TableCellContent({ text }: { text: string }) {
  // Detect bullet content, either unicode • or markdown -/*/–
  const hasBullet = /(?:^|[\n])[\s]*[•\-\*–]/.test(text) || text.includes(" • ");

  if (!hasBullet) {
    return <InlineContent text={text} />;
  }

  // Normalise: replace " • " (inline) with newline + bullet, then split on lines
  const normalised = text
    .replace(/\s*•\s*/g, "\n• ")   // collapse inline • into newlines
    .replace(/\n{2,}/g, "\n")       // collapse multiple blank lines
    .trim();

  const lines = normalised.split("\n").map(l => l.trim()).filter(Boolean);

  // Separate leading non-bullet text (e.g. a header line before bullets start)
  const headerLines: string[] = [];
  const bulletItems: string[] = [];
  let inBullets = false;

  for (const line of lines) {
    if (/^[•\-\*–]\s/.test(line)) {
      inBullets = true;
      bulletItems.push(line.replace(/^[•\-\*–]\s*/, "").trim());
    } else if (!inBullets) {
      headerLines.push(line);
    } else {
      // continuation of a bullet item
      if (bulletItems.length > 0) {
        bulletItems[bulletItems.length - 1] += " " + line;
      }
    }
  }

  return (
    <>
      {headerLines.map((h, i) => (
        <p key={`h${i}`} className="eval-cell-header"><InlineContent text={h} /></p>
      ))}
      {bulletItems.length > 0 && (
        <ul className="eval-cell-list">
          {bulletItems.map((item, i) => (
            <li key={i}><InlineContent text={item} /></li>
          ))}
        </ul>
      )}
    </>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        elements.push(<h2 key={key++} className="eval-h1"><InlineContent text={block.text} /></h2>);
        break;
      case "h2":
        elements.push(<h3 key={key++} className="eval-h2"><InlineContent text={block.text} /></h3>);
        break;
      case "h3":
        elements.push(<h4 key={key++} className="eval-h3"><InlineContent text={block.text} /></h4>);
        break;
      case "list":
        elements.push(
          <ul key={key++} className="eval-list">
            {block.items.map((item, i) => (
              <li key={i}><InlineContent text={item} /></li>
            ))}
          </ul>
        );
        break;
      case "table":
        elements.push(
          <div key={key++} className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>{block.headers.map((h, i) => <th key={i}><InlineContent text={h} /></th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}><TableCellContent text={cell} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        break;
      case "p":
        elements.push(<p key={key++} className="eval-p"><InlineContent text={block.text} /></p>);
        break;
      case "blank":
        break;
    }
  }

  return <div className="eval-markdown">{elements}</div>;
}

// ── Page component ────────────────────────────────────────────────────────────

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type EvalMode = "prep" | "storyboard" | "presentation" | "compelling";

const EVAL_OPTIONS: Array<{ key: EvalMode; tag: string; title: string; blurb: string }> = [
  { key: "prep", tag: "Worksheet", title: "Proper Prep", blurb: "Pressure-test your prep worksheet before you build anything." },
  { key: "storyboard", tag: "Structure", title: "Story Board", blurb: "Check your narrative structure and flow before you make slides." },
  { key: "presentation", tag: "Full deck", title: "Presentation", blurb: "A full scored, section-by-section read of your finished deck." },
  { key: "compelling", tag: "Slide-by-slide", title: "Compelling Content", blurb: "A slide-by-slide design evaluation of your deck's content." }
];

const EVAL_TITLES: Record<EvalMode, string> = {
  prep: "Proper Prep evaluation.",
  storyboard: "Story Board evaluation.",
  presentation: "Full structured storytelling evaluation.",
  compelling: "Compelling Content, slide by slide."
};

export default function PlatformEvaluatorPage() {
  const { getRequestHeaders } = useAuth();
  const [mode, setMode] = useState<EvalMode | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [artifact, setArtifact] = useState<Awaited<ReturnType<typeof buildArtifact>> | null>(null);
  const [reportId] = useState(() => generateId());
  const [notes, setNotes] = useState("");
  const [phase1Markdown, setPhase1Markdown] = useState<string | null>(null);
  const [phase2Markdown, setPhase2Markdown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(1);
  const [progressPct, setProgressPct] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);
  const apiStartRef = useRef<number>(0);

  function clearProgressInterval() {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }

  // Time-based crawl after upload completes. Phase 1: slow (CloudConvert + Claude).
  // Phase 2: faster (no image conversion, just text + Claude).
  function startApiProgressTimer(phase: 1 | 2) {
    clearProgressInterval();
    apiStartRef.current = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - apiStartRef.current) / 1000;
      let pct: number;
      if (phase === 1) {
        if (elapsed < 25) {
          // Converting slides: 15% → 64% over 25 s, asymptotic cap at 63%
          pct = 15 + 49 * Math.min(elapsed / 25, 0.98);
        } else {
          // Analyzing story: 65% → 92% over 20 s
          pct = 65 + 27 * Math.min((elapsed - 25) / 20, 0.96);
        }
      } else {
        if (elapsed < 8) {
          // Extracting text: 0% → 20% over 8 s
          pct = 20 * Math.min(elapsed / 8, 0.95);
        } else if (elapsed < 25) {
          // Analyzing: 20% → 70% over 17 s
          pct = 20 + 50 * Math.min((elapsed - 8) / 17, 0.97);
        } else {
          // Compiling: 70% → 92% over 15 s
          pct = 70 + 22 * Math.min((elapsed - 25) / 15, 0.95);
        }
      }
      setProgressPct(Math.round(pct));
    }, 250);
  }

  async function handleEvaluate() {
    if (!file) {
      setError("Select a PDF, PowerPoint, or text file to evaluate.");
      return;
    }

    setError("");
    setPhase1Markdown(null);
    setPhase2Markdown(null);
    setIsRunning(true);
    setCurrentPhase(1);
    setProgressPct(0);

    try {
      // Upload is the first real step, show a quick crawl to ~12%
      clearProgressInterval();
      progressIntervalRef.current = window.setInterval(() => {
        setProgressPct(prev => Math.min(prev + 1, 12));
      }, 200);

      const built = await buildArtifact(file);
      setArtifact(built);

      // Upload complete, jump to 15% and start the API timer
      clearProgressInterval();
      setProgressPct(15);
      startApiProgressTimer(1);

      const headers = await getRequestHeaders();
      const phase1Response = await fetch("/api/platform-evaluator", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ artifacts: [built], notes, phase: 1, reportId, filename: file.name })
      });

      if (!phase1Response.ok) {
        const text = await phase1Response.text();
        let msg = "Evaluation failed.";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch { /* use fallback */ }
        throw new Error(msg);
      }

      const phase1Result = (await phase1Response.json()) as { markdown: string };
      clearProgressInterval();
      setProgressPct(100);
      setPhase1Markdown(phase1Result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      clearProgressInterval();
      setIsRunning(false);
    }
  }

  async function handleSlideBySlide() {
    if (!artifact || !phase1Markdown) return;

    setError("");
    setPhase2Markdown(null);
    setIsRunning(true);
    setCurrentPhase(2);
    setProgressPct(0);
    startApiProgressTimer(2);

    try {
      const headers = await getRequestHeaders();
      const phase2Response = await fetch("/api/platform-evaluator", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          artifacts: [artifact],
          notes,
          phase: 2,
          priorOutput: phase1Markdown,
          reportId,
          filename: file?.name ?? "Evaluation"
        })
      });

      if (!phase2Response.ok) {
        const text = await phase2Response.text();
        let msg = "Slide-by-slide evaluation failed.";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch { /* use fallback */ }
        throw new Error(msg);
      }

      const phase2Result = (await phase2Response.json()) as { markdown: string };
      clearProgressInterval();
      setProgressPct(100);
      setPhase2Markdown(phase2Result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slide-by-slide evaluation failed.");
    } finally {
      clearProgressInterval();
      setIsRunning(false);
    }
  }

  // Compelling Content = slide-by-slide (phase 2) only, no section eval / priorOutput.
  async function handleCompelling() {
    if (!file) {
      setError("Select a PDF, PowerPoint, or text file to evaluate.");
      return;
    }
    setError("");
    setPhase1Markdown(null);
    setPhase2Markdown(null);
    setIsRunning(true);
    setCurrentPhase(2);
    setProgressPct(0);

    try {
      clearProgressInterval();
      progressIntervalRef.current = window.setInterval(() => {
        setProgressPct(prev => Math.min(prev + 1, 12));
      }, 200);

      const built = await buildArtifact(file);
      setArtifact(built);

      clearProgressInterval();
      setProgressPct(15);
      startApiProgressTimer(2);

      const headers = await getRequestHeaders();
      const response = await fetch("/api/platform-evaluator", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ artifacts: [built], notes, phase: 2, reportId, filename: file.name })
      });

      if (!response.ok) {
        const text = await response.text();
        let msg = "Slide-by-slide evaluation failed.";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch { /* use fallback */ }
        throw new Error(msg);
      }

      const result = (await response.json()) as { markdown: string };
      clearProgressInterval();
      setProgressPct(100);
      setPhase2Markdown(result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slide-by-slide evaluation failed.");
    } finally {
      clearProgressInterval();
      setIsRunning(false);
    }
  }

  function resetDeckState() {
    clearProgressInterval();
    setFile(null);
    setArtifact(null);
    setNotes("");
    setPhase1Markdown(null);
    setPhase2Markdown(null);
    setError("");
    setProgressPct(0);
    setIsRunning(false);
  }

  function backToSelection() {
    resetDeckState();
    setMode(null);
  }

  const hasResults = phase1Markdown || phase2Markdown;
  const isCompelling = mode === "compelling";

  return (
    <section className="page platform-evaluator-page">
      <section className="app-hero">
        <p className="section-kicker">Apply · Story Lab</p>
        <h1 className="page-title">{mode ? EVAL_TITLES[mode] : "What do you want to evaluate?"}</h1>
        <p className="page-subtitle">
          {mode
            ? "Paste or upload your work and get scored, specific feedback against the TPG Persuasive Storytelling methodology."
            : "Pick the stage you want to put under the TPG lens, from your prep worksheet through your finished deck."}
        </p>
      </section>

      {/* ── Selection screen ─────────────────────────────────────── */}
      {mode === null ? (
        <div className="eval-select-grid">
          {EVAL_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" className="eval-select-card" onClick={() => { resetDeckState(); setMode(opt.key); }}>
              <span className="eval-select-tag">{opt.tag}</span>
              <h3 className="eval-select-title">{opt.title}</h3>
              <p className="eval-select-blurb">{opt.blurb}</p>
              <span className="eval-select-cta">Select →</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="secondary-link eval-back-link" onClick={backToSelection}>
          ← Choose another
        </button>
      )}

      {/* ── Text evaluators (Proper Prep / Story Board) ──────────── */}
      {mode === "prep" ? (
        <TextEvaluatorPanel
          endpoint="/api/platform-prep-evaluator"
          getHeaders={getRequestHeaders}
          titlePlaceholder="e.g. Q3 Walmart category review"
          pastePlaceholder="Paste your Proper Prep worksheet: audience, behavioral style and position, core / business / personal needs, desired outcome, reasons to say yes, reasons to say no."
          runLabel="Evaluate my prep"
        />
      ) : null}
      {mode === "storyboard" ? (
        <TextEvaluatorPanel
          endpoint="/api/platform-storyboard-evaluator"
          getHeaders={getRequestHeaders}
          titlePlaceholder="e.g. Q3 Walmart category review"
          pastePlaceholder="Paste your storyboard, section by section: Opening Gambit, Desired Outcome, Situation/Root Cause, Big Idea, How It Works, WIIFM, Close, Actions."
          runLabel="Evaluate my storyboard"
        />
      ) : null}

      {/* ── Deck evaluators (Presentation / Compelling Content) ──── */}
      {mode === "presentation" || mode === "compelling" ? (
        <>
        <div className="card surface-card platform-evaluator-form-card">
        <div className="platform-evaluator-form-grid">
          <div>
            <h2 className="card-title">Presentation file</h2>
            <label className="platform-eval-file-label">
              <input
                type="file"
                accept={acceptedTypes}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPhase1Markdown(null);
                  setPhase2Markdown(null);
                  setError("");
                }}
              />
            </label>
            <p className="helper-copy">Accepted: PDF, PowerPoint (.pptx), plain text or markdown export.</p>
            {file ? <p className="helper-copy"><strong>Selected:</strong> {file.name}</p> : null}
          </div>

          <div>
            <label>
              <span className="card-title">Context</span>
              <textarea
                className="platform-eval-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional: audience, meeting type, objective, or anything useful for interpreting the deck."
              />
            </label>
          </div>
        </div>

        <div className="platform-evaluator-actions">
          <button
            className="primary-pill-button"
            type="button"
            onClick={() => void (isCompelling ? handleCompelling() : handleEvaluate())}
            disabled={isRunning}
          >
            {isCompelling ? "Evaluate slide-by-slide" : "Evaluate deck"}
          </button>
          {hasResults && !isRunning ? (
            <button
              className="secondary-link"
              type="button"
              onClick={() => {
                setPhase1Markdown(null);
                setPhase2Markdown(null);
                setFile(null);
                setNotes("");
                setError("");
              }}
            >
              Start over
            </button>
          ) : null}
        </div>

        {isRunning ? (
          <div className="platform-eval-progress">
            <div className="platform-eval-progress-steps">
              {(currentPhase === 1 ? PHASE1_STEPS : PHASE2_STEPS).map(step => {
                const isDone = progressPct > step.threshold + 1;
                const isActive = !isDone && progressPct >= step.threshold;
                return (
                  <div key={step.key} className={`platform-eval-step${isDone ? " done" : isActive ? " active" : ""}`}>
                    <div className="platform-eval-step-dot" />
                    <span className="platform-eval-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="delivery-progress-track">
              <div
                className="delivery-progress-fill"
                style={{ width: `${progressPct}%`, transition: "width 0.25s ease" }}
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="delivery-error-text" style={{ marginTop: "12px" }}>{error}</p> : null}
      </div>

      {phase1Markdown ? (
        <>
          <EvalScoreSummary markdown={phase1Markdown} />
          <div className="card surface-card platform-evaluator-result-card">
            <p className="section-kicker">Story Analysis</p>
            <MarkdownView markdown={phase1Markdown} />
          </div>
        </>
      ) : null}

      {phase1Markdown && !phase2Markdown && !isRunning ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
          <button
            className="primary-pill-button"
            type="button"
            onClick={() => void handleSlideBySlide()}
          >
            Run slide-by-slide evaluation
          </button>
        </div>
      ) : null}

      {phase2Markdown ? (
        <div className="card surface-card platform-evaluator-result-card">
          <p className="section-kicker">Slide-by-Slide Evaluation</p>
          <MarkdownView markdown={phase2Markdown} />
        </div>
      ) : null}
        </>
      ) : null}
    </section>
  );
}
