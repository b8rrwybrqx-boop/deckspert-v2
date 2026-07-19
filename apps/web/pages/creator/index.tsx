import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { upload } from "@vercel/blob/client";
import { postJson } from "../../src/api";
import { useAuth } from "../../src/auth/useAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

type BehavioralStyle = "thinker" | "director" | "relater" | "socializer" | "unknown";
type ArtifactKind = "image" | "pdf" | "pptx" | "doc" | "text" | "video";

type AudienceNeeds = {
  core: string[];
  business: string[];
  personal: string[];
};

type ExtractedInputs = {
  audience: {
    roleLevel: string | null;
    behavioralStyle: BehavioralStyle;
    behavioralStyleRationale?: string | null;
    assumptions: string[];
  };
  needs: AudienceNeeds;
  desiredOutcome: string | null;
  reasonsYes: string[];
  reasonsNo: string[];
  situation: string | null;
  rootCause: string | null;
  draftBigIdea: string | null;
  draftOpeningGambit?: string | null;
  wiifm?: string | null;
  proofPoints: string[];
  actions: string[];
  constraints: string[];
  metrics: string[];
  meetingLengthMinutes: number;
  minutesPerSlide: number;
  storyComplexity: "low" | "medium" | "high";
  creatorMode?: string;
};

type ExtractResponse = {
  creatorVersion: "v2";
  extractedInputs: ExtractedInputs;
  sectionMapProposal: {
    meetingLengthMinutes: number | null;
    minutesPerSlide: number | null;
    targetSlides: number | null;
    totalSlides: number;
    slidesBySection: Record<string, number>;
    rationale: string;
  };
  gaps: string[];
  artifactsUsed?: Array<{ label: string; kind: ArtifactKind }>;
};

type StorylineSection = {
  key: string;
  label: string;
  takeawayHeadline: string;
  narrative: string;
  visualMetaphor: string;
  wiifm: string;
  behavioralNote: string;
};

type StorylineResponse = {
  creatorVersion: "v2";
  storyline: StorylineSection[];
};

type SlideOutlineItem = {
  slideNumber: number;
  sectionKey: string;
  sectionLabel: string;
  headline: string;
  bullets: string[];
  speakerNote: string;
  visualSuggestion: string;
};

type OutlineResponse = {
  creatorVersion: "v2";
  targetTool: string;
  outline: SlideOutlineItem[];
  toolTips: string;
};

type DocumentInput = {
  label: string;
  kind: ArtifactKind;
  content: string;
  sourceUrl?: string;
  fileDataBase64?: string;
  filename?: string;
  contentType?: string;
  extractedText?: string;
  visionSummary?: string;
  notes?: string;
};

type CreatorStep = "input" | "properPrep" | "storyline" | "outline";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: {
    type: "regenerate-storyline" | "regenerate-outline";
    directive: string;
    label: string;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT_TYPES = [
  "Unstructured notes",
  "Proper Prep document",
  "Storyboard outline",
  "Existing slide deck",
  "Executive summary",
  "Strategy memo"
] as const;

const TEXT_LIKE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "tsv", "html"]);
const BEHAVIORAL_STYLES: BehavioralStyle[] = ["thinker", "director", "relater", "socializer"];
const TARGET_TOOLS = ["PowerPoint", "Gamma", "Beautiful.ai", "Google Slides", "Canva", "Other"];

const STORYLINE_COLUMNS = [
  { key: "takeawayHeadline", label: "Key takeaway", rows: 2 },
  { key: "narrative", label: "Narrative purpose", rows: 5 },
  { key: "visualMetaphor", label: "Visual direction", rows: 3 }
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferDocumentKind(file: File): ArtifactKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/")) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  if (ext === "doc" || ext === "docx") return "doc";
  return "text";
}

// Upload binary files to Vercel Blob so they bypass the serverless body limit.
// Text files stay inline (they're small enough to send directly).
async function uploadDocumentToBlob(
  file: File,
  kind: ArtifactKind
): Promise<{ content: string; sourceUrl?: string; note?: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (kind === "text" || file.type.startsWith("text/") || TEXT_LIKE_EXTENSIONS.has(ext)) {
    return { content: await file.text() };
  }
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload-token"
  });
  const note =
    kind === "pptx" ? "StoryBuild will read the slide content." :
    kind === "doc"  ? "StoryBuild will read the document text." :
    kind === "pdf"  ? "StoryBuild will read the document text." :
    kind === "image" ? "StoryBuild will read what is in this image." :
    "StoryBuild will use this as source material.";
  return { content: "", sourceUrl: blob.url, note };
}

function createProjectId() {
  return `creator-${crypto.randomUUID()}`;
}

function hasUsableContent(doc: DocumentInput): boolean {
  // A document is usable if it has inline text OR a blob URL (file uploaded to Vercel Blob)
  return Boolean(doc.content.trim() || doc.extractedText?.trim() || doc.visionSummary?.trim() || doc.sourceUrl);
}

function buildNeedsRow(needs: string[], index: number): string {
  return needs[index] ?? "";
}

function buildCopyText(outline: SlideOutlineItem[], targetTool?: string): string {
  const isGamma = targetTool?.toLowerCase() === "gamma";
  const separator = isGamma ? "\n\n---\n\n" : "\n\n";

  return outline
    .map(
      (slide) =>
        `Slide ${slide.slideNumber}: ${slide.sectionLabel} -- ${slide.headline}\n` +
        slide.bullets.map((b) => `  - ${b}`).join("\n") +
        `\nSpeaker note: ${slide.speakerNote}\nVisual: ${slide.visualSuggestion}`
    )
    .join(separator);
}

function makeMsgId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Paste your notes or add source files and I’ll pull out the key planning inputs. Once you have a storyline, ask me to adjust any section — try a different opening, sharpen the Big Idea, or expand How It Works."
};

// ── Planning Worksheet Component ──────────────────────────────────────────────

function PlanningWorksheet({
  inputs,
  onChange
}: {
  inputs: ExtractedInputs;
  onChange: (next: ExtractedInputs) => void;
}) {
  function setStyle(style: BehavioralStyle) {
    onChange({ ...inputs, audience: { ...inputs.audience, behavioralStyle: style } });
  }

  function setAudienceName(value: string) {
    onChange({ ...inputs, audience: { ...inputs.audience, roleLevel: value } });
  }

  function setNeedRow(category: keyof AudienceNeeds, index: number, value: string) {
    const updated = [...inputs.needs[category]];
    while (updated.length <= index) updated.push("");
    updated[index] = value;
    onChange({ ...inputs, needs: { ...inputs.needs, [category]: updated.filter((v, i) => i < 2 || v.trim()) } });
  }

  function setDesiredOutcome(value: string) {
    onChange({ ...inputs, desiredOutcome: value });
  }

  function setReasonsYes(value: string) {
    // Don't trim here -- trimming on every keystroke eats spaces as you type
    onChange({ ...inputs, reasonsYes: value.split("\n") });
  }

  function setReasonsNo(value: string) {
    onChange({ ...inputs, reasonsNo: value.split("\n") });
  }

  const needCategories: Array<{ key: keyof AudienceNeeds; label: string }> = [
    { key: "core", label: "Functional or departmental needs" },
    { key: "business", label: "Business needs" },
    { key: "personal", label: "Personal or professional needs" }
  ];

  return (
    <div className="pp-worksheet">
      {/* Header row */}
      <div className="pp-header">
        <div className="pp-header-who">
          <div className="pp-header-fields">
            <label className="pp-field-row">
              <span>Audience / Who:</span>
              <input
                value={inputs.audience.roleLevel ?? ""}
                onChange={(e) => setAudienceName(e.target.value)}
                placeholder="Role, level, company or context"
              />
            </label>
            <label className="pp-field-row">
              <span>Title / Role:</span>
              <input
                value={inputs.audience.assumptions[0] ?? ""}
                onChange={(e) => {
                  const next = [...inputs.audience.assumptions];
                  next[0] = e.target.value;
                  onChange({ ...inputs, audience: { ...inputs.audience, assumptions: next } });
                }}
                placeholder="e.g. VP Marketing, Category Buyer"
              />
            </label>
          </div>
          <div className="pp-who-label">Who</div>
        </div>
        <div className="pp-header-style">
          <div className="pp-step-circle">2</div>
          <span className="pp-style-title">Behavioral Style:</span>
          <div className="pp-style-grid">
            {BEHAVIORAL_STYLES.map((s) => (
              <label key={s} className="pp-style-option">
                <input
                  type="radio"
                  name="behavioralStyle"
                  checked={inputs.audience.behavioralStyle === s}
                  onChange={() => setStyle(s)}
                />
                <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Needs table */}
      <div className="pp-needs-section">
        <div className="pp-step-circle pp-step-circle-left">1</div>
        <table className="pp-needs-table">
          <thead>
            <tr>
              <th>Type of Audience Need</th>
              <th>Specific audience need</th>
              <th>Addressed by Desired Outcome?</th>
            </tr>
          </thead>
          <tbody>
            {needCategories.map(({ key, label }) =>
              [0, 1].map((rowIndex) => (
                <tr key={`${key}-${rowIndex}`} className={rowIndex === 0 ? "pp-row-first" : "pp-row-second"}>
                  {rowIndex === 0 ? (
                    <td rowSpan={2} className="pp-category-cell">
                      {label}
                    </td>
                  ) : null}
                  <td>
                    <input
                      className="pp-need-input"
                      value={buildNeedsRow(inputs.needs[key], rowIndex)}
                      onChange={(e) => setNeedRow(key, rowIndex, e.target.value)}
                      placeholder={`${label} ${rowIndex + 1}`}
                    />
                  </td>
                  <td className="pp-yn-cell">
                    <div className="pp-yn-buttons">
                      <button
                        type="button"
                        className={`pp-yn-btn ${buildNeedsRow(inputs.needs[key], rowIndex) ? "pp-yn-yes" : ""}`}
                        title="Addressed"
                      >
                        Y
                      </button>
                      <button type="button" className="pp-yn-btn" title="Not addressed">
                        N
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom row */}
      <div className="pp-bottom-row">
        <div className="pp-bottom-cell">
          <div className="pp-step-circle">3</div>
          <span className="pp-bottom-label">Desired Outcome</span>
          <textarea
            className="pp-bottom-textarea"
            rows={4}
            value={inputs.desiredOutcome ?? ""}
            onChange={(e) => setDesiredOutcome(e.target.value)}
            placeholder="The specific YES the presenter needs from this meeting..."
          />
        </div>
        <div className="pp-bottom-cell">
          <div className="pp-step-circle">4</div>
          <span className="pp-bottom-label">Reasons to Say Yes (specific need(s) it addresses)</span>
          <textarea
            className="pp-bottom-textarea"
            rows={4}
            value={inputs.reasonsYes.join("\n")}
            onChange={(e) => setReasonsYes(e.target.value)}
            placeholder="One reason per line..."
          />
        </div>
        <div className="pp-bottom-cell">
          <div className="pp-step-circle">5</div>
          <span className="pp-bottom-label">Reasons to Say No (objections)</span>
          <textarea
            className="pp-bottom-textarea"
            rows={4}
            value={inputs.reasonsNo.join("\n")}
            onChange={(e) => setReasonsNo(e.target.value)}
            placeholder="One objection per line..."
          />
        </div>
      </div>
    </div>
  );
}

// ── Inline-editable Storyline Table ───────────────────────────────────────────

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function StorylineTable({
  storyline,
  onChange
}: {
  storyline: StorylineSection[];
  onChange: (next: StorylineSection[]) => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);

  // Resize all textareas whenever storyline content changes (initial load + edits)
  useEffect(() => {
    if (!tableRef.current) return;
    tableRef.current.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(autoResize);
  }, [storyline]);

  function updateCell(sectionIndex: number, field: keyof StorylineSection, value: string) {
    const next = storyline.map((s, i) => (i === sectionIndex ? { ...s, [field]: value } : s));
    onChange(next);
  }

  return (
    <div className="storyline-table-wrapper">
      <table className="storyline-table" ref={tableRef}>
        <thead>
          <tr>
            <th className="sl-col-section">Story section</th>
            {STORYLINE_COLUMNS.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {storyline.map((section, sectionIndex) => (
            <tr key={section.key} className={sectionIndex % 2 === 0 ? "sl-row-even" : "sl-row-odd"}>
              <td className="sl-section-label">
                <span className="sl-section-num">{sectionIndex + 1}</span>
                {section.label}
              </td>
              {STORYLINE_COLUMNS.map((col) => (
                <td key={col.key} className="sl-editable-cell">
                  <textarea
                    className="sl-cell-textarea"
                    value={section[col.key as keyof StorylineSection] as string}
                    onChange={(e) => {
                      autoResize(e.target);
                      updateCell(sectionIndex, col.key as keyof StorylineSection, e.target.value);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Slide Outline Display ─────────────────────────────────────────────────────

function SlideOutlineView({ outline, toolTips }: { outline: SlideOutlineItem[]; toolTips: string }) {
  return (
    <div className="outline-view">
      {outline.map((slide) => (
        <div key={slide.slideNumber} className="outline-slide">
          <div className="outline-slide-header">
            <span className="outline-slide-num">Slide {slide.slideNumber}</span>
            <span className="outline-slide-section">{slide.sectionLabel}</span>
          </div>
          <p className="outline-headline">{slide.headline}</p>
          <ul className="outline-bullets">
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="outline-meta">
            <div className="outline-meta-block">
              <span className="outline-meta-label">Speaker note</span>
              <p>{slide.speakerNote}</p>
            </div>
            <div className="outline-meta-block">
              <span className="outline-meta-label">Visual</span>
              <p>{slide.visualSuggestion}</p>
            </div>
          </div>
        </div>
      ))}
      {toolTips ? (
        <div className="outline-tool-tips">
          <span className="outline-meta-label">Tips for your tool</span>
          <p>{toolTips}</p>
        </div>
      ) : null}
    </div>
  );
}

// ── Tool Modal ────────────────────────────────────────────────────────────────

function ToolModal({
  onConfirm,
  onCancel
}: {
  onConfirm: (tool: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("PowerPoint");
  const [custom, setCustom] = useState("");

  function handleConfirm() {
    const tool = selected === "Other" ? custom.trim() || "PowerPoint" : selected;
    onConfirm(tool);
  }

  return (
    <div className="tool-modal-backdrop">
      <div className="tool-modal">
        <h3>What tool are you building this in?</h3>
        <p className="tool-modal-hint">
          This helps format the outline to be directly usable in your chosen tool.
        </p>
        <div className="tool-modal-options">
          {TARGET_TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={`tool-option-btn${selected === t ? " tool-option-selected" : ""}`}
              onClick={() => setSelected(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {selected === "Other" ? (
          <input
            className="tool-modal-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Type your tool name..."
            autoFocus
          />
        ) : null}
        <div className="action-row">
          <button className="primary-button" type="button" onClick={handleConfirm}>
            Build outline
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, getRequestHeaders } = useAuth();

  const [projectId, setProjectId] = useState(() => searchParams.get("projectId") ?? createProjectId());
  const [step, setStep] = useState<CreatorStep>("input");

  // Input step
  const [notes, setNotes] = useState("");
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>("Unstructured notes");
  const [meetingLengthMinutes, setMeetingLengthMinutes] = useState(45);
  const [minutesPerSlide, setMinutesPerSlide] = useState(4);
  const [documents, setDocuments] = useState<DocumentInput[]>([]);
  const [documentContent, setDocumentContent] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);

  // Proper Prep step
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(null);
  const [confirmedInputs, setConfirmedInputs] = useState<ExtractedInputs | null>(null);
  const [gapNotes, setGapNotes] = useState("");

  // Storyline step
  const [storylineResult, setStorylineResult] = useState<StorylineSection[] | null>(null);

  // Outline step
  const [outlineResult, setOutlineResult] = useState<OutlineResponse | null>(null);
  const [showToolModal, setShowToolModal] = useState(false);
  const [targetTool, setTargetTool] = useState("PowerPoint");

  // Shared
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  // Context step — second structured field ("any additional background?")
  const [contextNotes, setContextNotes] = useState("");

  // Support rail / coach
  const [coachOpen, setCoachOpen] = useState(false);
  const railFileRef = useRef<HTMLInputElement>(null);

  // Prompt-to-update: set when a file is added after Proper Prep already exists
  const [pendingUpdate, setPendingUpdate] = useState<{ label: string } | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const canExtract =
    notes.trim().length > 0 || contextNotes.trim().length > 0 || documents.some(hasUsableContent);

  // Combine the two Context fields into one notes payload so /api/creator-extract
  // stays unchanged (it only reads a single `notes` string).
  function buildExtractNotes() {
    const main = notes.trim();
    const extra = contextNotes.trim();
    if (!extra) return main;
    return `${main}\n\n--- Additional background / context ---\n${extra}`;
  }

  // ── Scroll chat to bottom on new messages ──────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Autosave ───────────────────────────────────────────────────────────────

  // Strip content/base64 from documents for autosave -- only metadata + sourceUrl needed.
  // Cap sourceNotes at 40 KB so a large paste doesn't 413 the autosave endpoint.
  const MAX_NOTES_AUTOSAVE = 40_000;
  const autosavePayload = {
    step,
    meetingLengthMinutes,
    minutesPerSlide,
    documents: documents.map(({ content: _c, fileDataBase64: _b, ...rest }) => rest),
    contextNotes,
    gapNotes,
    storylineResult,
    outlineResult,
    targetTool
  };

  useEffect(() => {
    if (!user || !notes.trim() && !documents.length && !extractResult && !storylineResult) return;
    const tid = window.setTimeout(() => {
      const title =
        storylineResult?.[3]?.takeawayHeadline?.slice(0, 72) ??
        confirmedInputs?.desiredOutcome?.slice(0, 72) ??
        notes.split("\n").find((l) => l.trim())?.slice(0, 72) ??
        "Untitled storyline";
      void getRequestHeaders().then((headers) =>
        postJson("/api/creator-project", {
          action: "upsert",
          project: {
            id: projectId,
            title,
            inputType,
            sourceNotes: notes.length > MAX_NOTES_AUTOSAVE ? notes.slice(0, MAX_NOTES_AUTOSAVE) + "\n[truncated for storage]" : notes,
            extractedInputsJson: confirmedInputs ?? extractResult?.extractedInputs,
            sectionMapJson: extractResult?.sectionMapProposal,
            storyboardJson: autosavePayload,
            status: step === "outline" ? "complete" : "in_progress"
          }
        }, { headers })
      );
    }, 1200);
    return () => window.clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, notes, extractResult, confirmedInputs, storylineResult, outlineResult]);

  // ── Load existing project ──────────────────────────────────────────────────

  useEffect(() => {
    const pid = searchParams.get("projectId");
    if (!pid || !user) return;
    void getRequestHeaders()
      .then((headers) =>
        postJson<{
          project: {
            id: string;
            inputType: string;
            sourceNotes: string;
            extractedInputsJson: ExtractedInputs | null;
            sectionMapJson: ExtractResponse["sectionMapProposal"] | null;
            storyboardJson: typeof autosavePayload | null;
          };
        }>("/api/creator-project", { action: "get", projectId: pid }, { headers })
      )
      .then(({ project }) => {
        setProjectId(project.id);
        setInputType(project.inputType as (typeof INPUT_TYPES)[number]);
        setNotes(project.sourceNotes);
        if (project.extractedInputsJson && project.sectionMapJson) {
          setExtractResult({
            creatorVersion: "v2",
            extractedInputs: project.extractedInputsJson,
            sectionMapProposal: project.sectionMapJson,
            gaps: [],
            artifactsUsed: []
          });
          setConfirmedInputs(project.extractedInputsJson);
        }
        if (project.storyboardJson) {
          const s = project.storyboardJson;
          setStep(s.step ?? "input");
          setMeetingLengthMinutes(s.meetingLengthMinutes ?? 45);
          setMinutesPerSlide(s.minutesPerSlide ?? 4);
          // Documents are saved without content/base64 -- re-add empty content on load
          setDocuments((s.documents ?? []).map((d: Omit<DocumentInput, "content">) => ({ ...d, content: "" })));
          setContextNotes(s.contextNotes ?? "");
          setGapNotes(s.gapNotes ?? "");
          setStorylineResult(s.storylineResult ?? null);
          setOutlineResult(s.outlineResult ?? null);
          setTargetTool(s.targetTool ?? "PowerPoint");
        }
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // ── Generation cores (return data; no step side-effects) ────────────────────
  // Wrappers below add step transitions. The cores let the prompt-to-update
  // cascade re-run extract → storyline → outline without jumping the user around.

  async function runExtract(): Promise<ExtractResponse | null> {
    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<ExtractResponse>("/api/creator-extract", {
        notes: buildExtractNotes(),
        inputType,
        meetingLengthMinutes,
        minutesPerSlide,
        artifacts: documents.map((d) => ({
          label: d.label,
          kind: d.kind,
          sourceUrl: d.sourceUrl,
          filename: d.filename,
          contentType: d.contentType,
          content: d.content,
          extractedText: d.extractedText,
          visionSummary: d.visionSummary
        }))
      }, { headers });
      setExtractResult(response);
      setConfirmedInputs(response.extractedInputs);
      return response;
    } catch (e) {
      setError(e instanceof Error ? e.message : "StoryBuild couldn’t read your source material. What you entered is still here—try again.");
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  async function runStoryline(inputs: ExtractedInputs, directive?: string): Promise<StorylineSection[] | null> {
    setIsWorking(true);
    setError("");
    try {
      const withGaps = gapNotes.trim()
        ? {
            ...inputs,
            proofPoints: [
              ...inputs.proofPoints,
              ...gapNotes.split("\n").map((s) => s.trim()).filter(Boolean)
            ]
          }
        : inputs;
      const headers = await getRequestHeaders();
      const response = await postJson<StorylineResponse>("/api/creator-storyline", {
        extractedInputs: withGaps,
        ...(directive?.trim() ? { directive: directive.trim() } : {})
      }, { headers });
      setStorylineResult(response.storyline);
      return response.storyline;
    } catch (e) {
      setError(e instanceof Error ? e.message : "StoryBuild couldn’t create the storyline. Your source material and planning inputs are still here. Try again.");
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  async function runOutline(
    storyline: StorylineSection[],
    inputs: ExtractedInputs,
    tool: string,
    directive?: string,
    previousOutline?: SlideOutlineItem[]
  ): Promise<OutlineResponse | null> {
    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<OutlineResponse>("/api/creator-outline", {
        storyline,
        targetTool: tool,
        audienceRole: inputs.audience.roleLevel,
        behavioralStyle: inputs.audience.behavioralStyle,
        ...(directive?.trim() ? { directive: directive.trim() } : {}),
        meetingLengthMinutes: inputs.meetingLengthMinutes,
        minutesPerSlide: inputs.minutesPerSlide,
        slidesBySection: extractResult?.sectionMapProposal?.slidesBySection,
        ...(previousOutline?.length ? { previousOutline } : {})
      }, { headers });
      setOutlineResult(response);
      return response;
    } catch (e) {
      setError(e instanceof Error ? e.message : "StoryBuild couldn’t create the slide outline. Your storyline is still here. Try again.");
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  // ── Button wrappers (core + step transition) ────────────────────────────────

  async function handleExtract() {
    const response = await runExtract();
    if (!response) return;
    setStorylineResult(null);
    setOutlineResult(null);
    setGapNotes("");
    setStep("properPrep");
  }

  async function handleBuildStoryline(directive?: string) {
    if (!confirmedInputs) return;
    const storyline = await runStoryline(confirmedInputs, directive);
    if (!storyline) return;
    setOutlineResult(null);
    setStep("storyline");
  }

  async function handleBuildOutline(tool: string, directive?: string) {
    if (!storylineResult || !confirmedInputs) return;
    setTargetTool(tool);
    setShowToolModal(false);
    const response = await runOutline(
      storylineResult,
      confirmedInputs,
      tool,
      directive,
      outlineResult?.outline
    );
    if (!response) return;
    setStep("outline");
  }

  // ── Prompt-to-update cascade ────────────────────────────────────────────────
  // Extract is the only place raw files get read, so new context flows in through
  // it and cascades forward to whatever the user has already built.

  async function applyContextUpdate() {
    const fromStep = step;
    setPendingUpdate(null);
    const ext = await runExtract();
    if (!ext) return;
    if (fromStep === "storyline" || fromStep === "outline") {
      const storyline = await runStoryline(ext.extractedInputs);
      if (storyline && fromStep === "outline") {
        await runOutline(storyline, ext.extractedInputs, targetTool, undefined, outlineResult?.outline);
      }
    }
  }

  async function handleDocumentUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploadingDocs(true);
    try {
      const loaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const kind = inferDocumentKind(file);
          const { content, sourceUrl, note } = await uploadDocumentToBlob(file, kind);
          return {
            label: file.name,
            kind,
            content,
            sourceUrl,
            filename: file.name,
            contentType: file.type,
            notes: note
          } satisfies DocumentInput;
        })
      );
      setDocuments((prev) => [...prev, ...loaded]);
      // If a draft already exists, offer to fold the new context into it.
      if (extractResult) setPendingUpdate({ label: loaded.map((d) => d.label).join(", ") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t add that file. Try again, or paste the relevant content into the text field.");
    } finally {
      setIsUploadingDocs(false);
    }
  }

  async function handleImagePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setIsUploadingDocs(true);
    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const filename = `screenshot-${Date.now()}.png`;
      const namedFile = new File([file], filename, { type: file.type });
      const blob = await upload(filename, namedFile, {
        access: "public",
        handleUploadUrl: "/api/upload-token"
      });
      setDocuments((prev) => [
        ...prev,
        {
          label: `Screenshot (${timestamp})`,
          kind: "image",
          content: "",
          sourceUrl: blob.url,
          filename,
          contentType: file.type,
          notes: "Pasted screenshot -- will be analyzed for content."
        }
      ]);
      if (extractResult) setPendingUpdate({ label: `Screenshot (${timestamp})` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t add that screenshot. Try again, or paste the relevant content as text.");
    } finally {
      setIsUploadingDocs(false);
    }
  }

  async function handleCopyOutline() {
    if (!outlineResult) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(outlineResult.outline, outlineResult.targetTool));
      setCopyMessage("Copied to clipboard.");
      setTimeout(() => setCopyMessage(""), 3000);
    } catch {
      setCopyMessage("We couldn’t copy to your clipboard in this browser. Select the outline and copy it manually.");
    }
  }

  function handleStartOver() {
    setProjectId(createProjectId());
    setStep("input");
    setNotes("");
    setContextNotes("");
    setInputType("Unstructured notes");
    setMeetingLengthMinutes(45);
    setMinutesPerSlide(4);
    setDocuments([]);
    setDocumentContent("");
    setShowManualEntry(false);
    setPendingUpdate(null);
    setGapNotes("");
    setExtractResult(null);
    setConfirmedInputs(null);
    setStorylineResult(null);
    setOutlineResult(null);
    setError("");
    setCopyMessage("");
    setChatMessages([WELCOME_MESSAGE]);
    setChatInput("");
    navigate("/platform/creator", { replace: true });
  }

  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading) return;
    const userMsg: ChatMessage = { id: makeMsgId(), role: "user", content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);
    // Hard timeout in case the API or Anthropic hangs, the loading state
    // must always clear so the user can keep chatting.
    const watchdog = window.setTimeout(() => {
      setIsChatLoading(false);
      setChatMessages(prev => [
        ...prev,
        { id: makeMsgId(), role: "assistant", content: "That took too long, please try again." }
      ]);
    }, 60_000);
    try {
      const headers = await getRequestHeaders();
      // Build history without the action field (API only needs role+content)
      const history = [...chatMessages, userMsg]
        .filter(m => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));
      // Build a brief input context so the AI knows what's been uploaded/pasted
      const inputContext = step === "input" ? {
        notesSnippet: notes.trim() ? notes.trim().slice(0, 600) : undefined,
        documentLabels: documents.length ? documents.map(d => `${d.label} (${d.kind})`).join(", ") : undefined
      } : undefined;
      const res = await postJson<{ reply: string; action?: ChatMessage["action"] }>(
        "/api/creator-chat",
        {
          messages: history.length ? history : [{ role: "user" as const, content: text }],
          step,
          confirmedInputs,
          storyline: storylineResult,
          outline: outlineResult?.outline ?? null,
          targetTool,
          inputContext
        },
        { headers }
      );
      setChatMessages(prev => [
        ...prev,
        { id: makeMsgId(), role: "assistant", content: res.reply, action: res.action }
      ]);
    } catch {
      setChatMessages(prev => [
        ...prev,
        { id: makeMsgId(), role: "assistant", content: "Something went wrong -- please try again." }
      ]);
    } finally {
      window.clearTimeout(watchdog);
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, chatMessages, step, notes, documents, confirmedInputs, storylineResult, outlineResult, targetTool, getRequestHeaders]);

  // Debug helper: re-runs the LAST user message through the debug endpoint so
  // we can see exactly what the model returned (raw text + parsed result +
  // any normalize error). Output is appended into the chat panel as a
  // collapsible code block so you can copy the JSON and share it.
  const handleChatDebug = useCallback(async () => {
    if (isChatLoading) return;
    const lastUserMsg = [...chatMessages].reverse().find(m => m.role === "user");
    if (!lastUserMsg) {
      setChatMessages(prev => [...prev, {
        id: makeMsgId(),
        role: "assistant",
        content: "[debug] no prior user message to replay"
      }]);
      return;
    }
    setIsChatLoading(true);
    const watchdog = window.setTimeout(() => {
      setIsChatLoading(false);
      setChatMessages(prev => [...prev, {
        id: makeMsgId(),
        role: "assistant",
        content: "[debug] timed out, try again."
      }]);
    }, 90_000);
    try {
      const headers = await getRequestHeaders();
      const history = chatMessages
        .filter(m => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));
      const inputContext = step === "input" ? {
        notesSnippet: notes.trim() ? notes.trim().slice(0, 600) : undefined,
        documentLabels: documents.length ? documents.map(d => `${d.label} (${d.kind})`).join(", ") : undefined
      } : undefined;
      const debug = await postJson<Record<string, unknown>>(
        "/api/creator-chat-debug",
        {
          messages: history.length ? history : [{ role: "user" as const, content: lastUserMsg.content }],
          step,
          confirmedInputs,
          storyline: storylineResult,
          outline: outlineResult?.outline ?? null,
          targetTool,
          inputContext
        },
        { headers }
      );
      const pretty = JSON.stringify(debug, null, 2);
      setChatMessages(prev => [...prev, {
        id: makeMsgId(),
        role: "assistant",
        content: `[debug] ${pretty}`
      }]);
    } catch (e) {
      setChatMessages(prev => [...prev, {
        id: makeMsgId(),
        role: "assistant",
        content: `[debug] error: ${e instanceof Error ? e.message : String(e)}`
      }]);
    } finally {
      window.clearTimeout(watchdog);
      setIsChatLoading(false);
    }
  }, [isChatLoading, chatMessages, step, notes, documents, confirmedInputs, storylineResult, outlineResult, targetTool, getRequestHeaders]);

  // ── Steps / navigation ──────────────────────────────────────────────────────

  const STEPS: Array<{ key: CreatorStep; label: string }> = [
    { key: "input", label: "Source material" },
    { key: "properPrep", label: "Proper Prep" },
    { key: "storyline", label: "Storyline" },
    { key: "outline", label: "Slide outline" }
  ];

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // Revisit guard — a step is reachable once the work that precedes it exists.
  function stepAvailable(key: CreatorStep): boolean {
    if (key === "input") return true;
    if (key === "properPrep") return Boolean(confirmedInputs);
    if (key === "storyline") return Boolean(storylineResult);
    if (key === "outline") return Boolean(outlineResult);
    return false;
  }

  function gotoStep(key: CreatorStep) {
    if (stepAvailable(key)) setStep(key);
  }

  // Storyboard completeness check (client-side; no backend change). Only flags
  // fields that are actually editable in the table (headline + narrative).
  const storyboardGaps: string[] = storylineResult
    ? storylineResult.flatMap((s) => {
        const out: string[] = [];
        if (!s.takeawayHeadline || s.takeawayHeadline.trim().length < 8)
          out.push(`${s.label}: add a takeaway headline`);
        if (!s.narrative || s.narrative.trim().length < 24)
          out.push(`${s.label}: the narrative is thin, add 3-5 sentences`);
        return out;
      })
    : [];

  // Step-aware coach starter prompts
  const COACH_PROMPTS: Record<CreatorStep, string[]> = {
    input: ["What makes a strong opening?", "How specific should my context be?"],
    properPrep: ["Sharpen my desired outcome", "What objections am I missing?"],
    storyline: ["Try a bolder opening gambit", "Tighten the Big Idea"],
    outline: ["Make the close punchier", "Suggest a visual for the Big Idea slide"]
  };

  const builtFrom = extractResult?.artifactsUsed?.length
    ? extractResult.artifactsUsed.map((a) => a.label).join(", ")
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="creator-page">
      {/* ── Progress stepper ───────────────────────────────────── */}
      <div className="creator-stepper">
        <span className="creator-stepper-label">StoryLab · StoryBuild</span>
        <div className="creator-stepper-track">
          {STEPS.map((s, i) => {
            const state = i === stepIndex ? "active" : i < stepIndex ? "done" : "todo";
            const available = stepAvailable(s.key);
            return (
              <button
                key={s.key}
                type="button"
                className={`creator-stepper-step creator-stepper-step-${state}${available ? "" : " creator-stepper-step-locked"}`}
                onClick={() => gotoStep(s.key)}
                disabled={!available}
                aria-current={i === stepIndex ? "step" : undefined}
              >
                <span className="creator-stepper-num">{i + 1}</span>
                <span className="creator-stepper-text">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="helper-error creator-error">{error}</p> : null}

      <div className="creator-layout">
        {/* ── WORKSPACE (source of truth) ──────────────────────── */}
        <div className="creator-workspace">
          {/* Prompt-to-update banner */}
          {pendingUpdate && step !== "input" ? (
            <div className="creator-update-banner">
              <div className="creator-update-copy">
                <strong>New context added{pendingUpdate.label ? `: ${pendingUpdate.label}` : ""}.</strong>
                <span>
                  {step === "properPrep"
                    ? " Update your Proper Prep with it?"
                    : " It updates your Proper Prep, which feeds this stage. Update and rebuild?"}
                </span>
              </div>
              <div className="creator-update-actions">
                <button className="primary-button" type="button" disabled={isWorking} onClick={() => void applyContextUpdate()}>
                  {isWorking ? "Updating…" : "Update draft"}
                </button>
                <button className="secondary-button" type="button" onClick={() => setPendingUpdate(null)}>
                  Not now
                </button>
              </div>
            </div>
          ) : null}

          {/* ── STEP: CONTEXT ──────────────────────────────────── */}
          {step === "input" ? (
            <div className="creator-stage">
              <div className="creator-stage-head">
                <h2 className="creator-stage-title">Add your source material</h2>
                <p className="creator-stage-guide">
                  Tell me about the presentation. I'll draft from this, and you'll fill any gaps as we go.
                </p>
              </div>

              <label className="field">
                <span className="creator-field-label">Tell me about the presentation you want to build</span>
                <textarea
                  rows={7}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onPaste={handleImagePaste}
                  placeholder="Who's the audience, what's the goal, what's the situation? Paste rough notes or an outline. You can paste a screenshot too."
                />
              </label>

              <label className="field">
                <span className="creator-field-label">Any additional background or context I should know about?</span>
                <textarea
                  rows={4}
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="Constraints, history, prior decisions, sensitivities, anything that shapes the story."
                />
              </label>

              <div className="creator-stage-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleExtract()}
                  disabled={isWorking || isUploadingDocs || !canExtract}
                >
                  {isWorking ? "Building…" : "Next →"}
                </button>
              </div>
            </div>
          ) : null}

          {/* ── STEP: PROPER PREP ──────────────────────────────── */}
          {step === "properPrep" && confirmedInputs ? (
            <div className="creator-stage">
              <div className="creator-stage-head">
                <h2 className="creator-stage-title">Proper Prep</h2>
                <p className="creator-stage-guide">
                  I drafted this from your context. Review, edit, and fill the gaps below.
                </p>
                {builtFrom ? <p className="creator-provenance">Built from: {builtFrom}</p> : null}
              </div>

              <PlanningWorksheet inputs={confirmedInputs} onChange={setConfirmedInputs} />

              {extractResult?.gaps.length ? (
                <div className="creator-gaps">
                  <h3 className="creator-gaps-title">Content &amp; Gaps</h3>
                  <p className="creator-gaps-sub">Fill these in to strengthen the story before building the storyline.</p>
                  <ul className="creator-gaps-list">
                    {extractResult.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                  <label className="field">
                    <span className="creator-field-label">Address gaps (optional)</span>
                    <textarea
                      rows={3}
                      value={gapNotes}
                      onChange={(e) => setGapNotes(e.target.value)}
                      placeholder="Add proof points, timeline assumptions, or context to sharpen the story…"
                    />
                  </label>
                </div>
              ) : null}

              <div className="creator-stage-actions">
                <button className="secondary-button" type="button" onClick={() => gotoStep("input")}>
                  ← Back
                </button>
                <button className="primary-button" type="button" onClick={() => void handleBuildStoryline()} disabled={isWorking}>
                  {isWorking ? "Building…" : "Next →"}
                </button>
              </div>
            </div>
          ) : null}

          {/* ── STEP: STORY BOARD ──────────────────────────────── */}
          {step === "storyline" && storylineResult ? (
            <div className="creator-stage">
              <div className="creator-stage-head">
                <h2 className="creator-stage-title">Storyline</h2>
                <p className="creator-stage-guide">
                  Edit any field directly. Each takeaway should state the conclusion the audience should reach—not simply name the topic.
                </p>
              </div>

              <StorylineTable storyline={storylineResult} onChange={setStorylineResult} />

              {storyboardGaps.length ? (
                <div className="creator-gaps">
                  <h3 className="creator-gaps-title">Output &amp; Gaps</h3>
                  <p className="creator-gaps-sub">These sections look thin. Fill them in, or ask the coach for help.</p>
                  <ul className="creator-gaps-list">
                    {storyboardGaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                  <button className="secondary-button" type="button" onClick={() => setCoachOpen(true)}>
                    Ask the coach
                  </button>
                </div>
              ) : null}

              <div className="creator-stage-actions">
                <button className="secondary-button" type="button" onClick={() => gotoStep("properPrep")}>
                  ← Back
                </button>
                <button className="primary-button" type="button" onClick={() => setShowToolModal(true)} disabled={isWorking}>
                  Next →
                </button>
              </div>

              {showToolModal ? (
                <ToolModal onConfirm={(tool) => void handleBuildOutline(tool)} onCancel={() => setShowToolModal(false)} />
              ) : null}
            </div>
          ) : null}

          {/* ── STEP: FULL STORY ───────────────────────────────── */}
          {step === "outline" && outlineResult ? (
            <div className="creator-stage">
              <div className="creator-stage-head creator-stage-head-row">
                <div>
                  <h2 className="creator-stage-title">Slide outline: {outlineResult.targetTool}</h2>
                  <p className="creator-stage-guide">
                    {outlineResult.outline.length} slides · Ready to paste into {outlineResult.targetTool}
                  </p>
                </div>
                <button className="secondary-button" type="button" onClick={() => void handleCopyOutline()}>
                  Copy all
                </button>
              </div>
              {copyMessage ? <p className="helper-copy">{copyMessage}</p> : null}
              <SlideOutlineView outline={outlineResult.outline} toolTips={outlineResult.toolTips} />

              <div className="creator-export">
                <h3 className="creator-gaps-title">Export</h3>
                <div className="export-options">
                  <button className="secondary-button" type="button" onClick={() => void handleCopyOutline()}>
                    Copy as text
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setShowToolModal(true)} disabled={isWorking}>
                    Rebuild for a different tool
                  </button>
                  <span className="export-coming-soon">PPTX export (coming soon)</span>
                </div>
              </div>

              <div className="creator-stage-actions">
                <button className="secondary-button" type="button" onClick={() => gotoStep("storyline")}>
                  ← Back
                </button>
                <button className="secondary-button" type="button" onClick={handleStartOver}>
                  Start Over
                </button>
              </div>

              {showToolModal ? (
                <ToolModal onConfirm={(tool) => void handleBuildOutline(tool)} onCancel={() => setShowToolModal(false)} />
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ── SUPPORT RAIL ─────────────────────────────────────── */}
        <aside className="creator-rail">
          {/* Attached Files */}
          <section className="creator-rail-section">
            <div className="creator-rail-head">
              <h3 className="creator-rail-title">Attached files</h3>
              <button
                className="creator-rail-add"
                type="button"
                onClick={() => railFileRef.current?.click()}
                disabled={isUploadingDocs}
              >
                + Add context
              </button>
            </div>
            <p className="creator-rail-sub">Add notes, an old deck, or screenshots, at any step.</p>
            <input
              ref={railFileRef}
              type="file"
              multiple
              hidden
              accept=".txt,.md,.csv,.json,.tsv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
              onChange={(e) => {
                void handleDocumentUpload(e.target.files);
                e.target.value = "";
              }}
            />
            {isUploadingDocs ? <p className="helper-copy">Uploading…</p> : null}
            {documents.length ? (
              <ul className="creator-rail-files">
                {documents.map((doc, idx) => (
                  <li key={`${doc.label}-${idx}`} className="creator-rail-file">
                    <span className="creator-rail-file-kind">{doc.kind}</span>
                    <span className="creator-rail-file-label" title={doc.label}>{doc.label}</span>
                    <button
                      className="creator-rail-file-remove"
                      type="button"
                      aria-label={`Remove ${doc.label}`}
                      onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      &#x2715;
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="creator-rail-empty">No files yet.</p>
            )}
            <button className="creator-rail-link" type="button" onClick={() => setShowManualEntry((v) => !v)}>
              {showManualEntry ? "Hide text entry" : "Paste text instead"}
            </button>
            {showManualEntry ? (
              <div className="creator-rail-manual">
                <textarea
                  rows={4}
                  value={documentContent}
                  onChange={(e) => setDocumentContent(e.target.value)}
                  placeholder="Paste text from a memo, prep form, or deck excerpt…"
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    if (!documentContent.trim()) return;
                    setDocuments((prev) => [...prev, { label: "Pasted text", kind: "text", content: documentContent.trim() }]);
                    if (extractResult) setPendingUpdate({ label: "Pasted text" });
                    setDocumentContent("");
                    setShowManualEntry(false);
                  }}
                >
                  Add text
                </button>
              </div>
            ) : null}
          </section>

          {/* StoryLab Coach */}
          <section className={`creator-rail-section creator-coach${coachOpen ? " creator-coach-open" : ""}`}>
            <button
              className="creator-coach-toggle"
              type="button"
              onClick={() => setCoachOpen((v) => !v)}
              aria-expanded={coachOpen}
            >
              <span className="creator-rail-title">Ask StoryCoach</span>
              <span className="creator-coach-caret">{coachOpen ? "▾" : "▸"}</span>
            </button>
            {coachOpen ? (
              <div className="creator-coach-body">
                <p className="creator-coach-instruction">
                  Ask for help or refinements. Your draft on the left stays the source of truth.
                </p>
                <div className="creator-coach-messages">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
                      {msg.content.startsWith("[debug]") ? (
                        <pre className="chat-msg-debug">{msg.content}</pre>
                      ) : (
                        <p className="chat-msg-text">{msg.content}</p>
                      )}
                      {msg.action ? (
                        <button
                          className="chat-apply-btn"
                          type="button"
                          disabled={isWorking}
                          onClick={async () => {
                            const action = msg.action!;
                            if (action.type === "regenerate-storyline") {
                              await handleBuildStoryline(action.directive);
                              setChatMessages((prev) => [...prev, {
                                id: makeMsgId(),
                                role: "assistant" as const,
                                content: "Storyline updated. Review it on the left. Your previous slide outline is now stale, so rebuild it to apply the changes."
                              }]);
                            } else {
                              await handleBuildOutline(targetTool, action.directive);
                              setChatMessages((prev) => [...prev, {
                                id: makeMsgId(),
                                role: "assistant" as const,
                                content: "Slide outline updated. Review the new slides on the left."
                              }]);
                            }
                          }}
                        >
                          {isWorking ? "Applying..." : msg.action.label}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {isChatLoading ? (
                    <div className="chat-msg chat-msg-assistant">
                      <p className="chat-msg-text chat-msg-typing">Thinking...</p>
                    </div>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>

                {chatMessages.length <= 1 ? (
                  <div className="creator-coach-suggest">
                    {COACH_PROMPTS[step].map((p) => (
                      <button key={p} type="button" className="creator-coach-chip" onClick={() => setChatInput(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="creator-coach-input-row">
                  <textarea
                    className="creator-chat-input"
                    rows={2}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleChatSend();
                      }
                    }}
                    placeholder={isChatLoading ? "Thinking… (you can keep typing)" : "Ask a question or request a change… (Enter to send)"}
                  />
                  <button
                    className="chat-send-btn"
                    type="button"
                    onClick={() => void handleChatSend()}
                    disabled={isChatLoading || !chatInput.trim()}
                    aria-label="Send"
                  >
                    &rarr;
                  </button>
                </div>
                <button
                  type="button"
                  className="creator-chat-debug-btn"
                  onClick={() => void handleChatDebug()}
                  disabled={isChatLoading}
                  title="Replay the last message and show the raw model output"
                >
                  Debug last call
                </button>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
