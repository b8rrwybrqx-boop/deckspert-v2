import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useAuth } from "../../src/auth/useAuth";

type ArtifactKind = "pdf" | "pptx" | "text";

const acceptedTypes = ".pdf,.ppt,.pptx,.txt,.md";

const PHASE1_STATUS = [
  "Uploading deck...",
  "Extracting slide content...",
  "Analyzing story structure...",
  "Evaluating section strength...",
  "Scoring against TPG frameworks..."
];

const PHASE2_STATUS = [
  "Scoring slide-by-slide...",
  "Reviewing page-level quality...",
  "Checking visual and readability signals...",
  "Compiling top opportunities...",
  "Finalizing evaluation report..."
];

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
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}><InlineContent text={cell} /></td>)}</tr>
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

export default function PlatformEvaluatorPage() {
  const { getRequestHeaders } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [artifact, setArtifact] = useState<Awaited<ReturnType<typeof buildArtifact>> | null>(null);
  const [reportId] = useState(() => generateId());
  const [notes, setNotes] = useState("");
  const [phase1Markdown, setPhase1Markdown] = useState<string | null>(null);
  const [phase2Markdown, setPhase2Markdown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(1);
  const [statusIdx, setStatusIdx] = useState(0);

  function currentStatusMessage() {
    const msgs = currentPhase === 2 ? PHASE2_STATUS : PHASE1_STATUS;
    return msgs[Math.min(statusIdx, msgs.length - 1)];
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
    setStatusIdx(0);

    const ticker = window.setInterval(() => {
      setStatusIdx(prev => prev + 1);
    }, 6000);

    try {
      const built = await buildArtifact(file);
      setArtifact(built);
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
      setPhase1Markdown(phase1Result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      window.clearInterval(ticker);
      setIsRunning(false);
    }
  }

  async function handleSlideBySlide() {
    if (!artifact || !phase1Markdown) return;

    setError("");
    setPhase2Markdown(null);
    setIsRunning(true);
    setCurrentPhase(2);
    setStatusIdx(0);

    const ticker = window.setInterval(() => {
      setStatusIdx(prev => prev + 1);
    }, 6000);

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
      setPhase2Markdown(phase2Result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slide-by-slide evaluation failed.");
    } finally {
      window.clearInterval(ticker);
      setIsRunning(false);
    }
  }

  const hasResults = phase1Markdown || phase2Markdown;

  return (
    <section className="page platform-evaluator-page">
      <section className="app-hero">
        <p className="section-kicker">Evaluator</p>
        <h1 className="page-title">Full structured storytelling evaluation.</h1>
        <p className="page-subtitle">
          Upload your deck and get a scored, section-by-section read against the TPG Persuasive Storytelling methodology — Proper Prep through Dynamic Delivery.
        </p>
      </section>

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
            onClick={() => void handleEvaluate()}
            disabled={isRunning}
          >
            {isRunning ? currentStatusMessage() : "Evaluate deck"}
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
      ) : isRunning && currentPhase === 2 ? (
        <div className="card surface-card platform-evaluator-result-card">
          <p className="section-kicker">Slide-by-Slide Evaluation</p>
          <p className="eval-p" style={{ color: "var(--text-secondary)" }}>
            {currentStatusMessage()}
          </p>
        </div>
      ) : null}
    </section>
  );
}
