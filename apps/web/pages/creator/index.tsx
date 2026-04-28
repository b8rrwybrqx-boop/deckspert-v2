import { useEffect, useRef, useState } from "react";
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
  { key: "takeawayHeadline", label: "Takeaway Headline", rows: 2 },
  { key: "narrative", label: "Narrative (3–5 sentences)", rows: 5 },
  { key: "visualMetaphor", label: "Visual / Metaphor", rows: 3 },
  { key: "wiifm", label: "WIIFM", rows: 3 },
  { key: "behavioralNote", label: "Behavioral Note", rows: 2 }
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
    kind === "pptx" ? "PowerPoint text will be extracted automatically." :
    kind === "doc"  ? "Word document text will be extracted automatically." :
    kind === "pdf"  ? "PDF text will be extracted automatically." :
    kind === "image" ? "Image uploaded for analysis." :
    "File uploaded for processing.";
  return { content: "", sourceUrl: blob.url, note };
}

function createProjectId() {
  return `creator-${crypto.randomUUID()}`;
}

function hasUsableText(doc: DocumentInput): boolean {
  return Boolean(doc.content.trim() || doc.extractedText?.trim() || doc.visionSummary?.trim());
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
        `Slide ${slide.slideNumber}: ${slide.sectionLabel} — ${slide.headline}\n` +
        slide.bullets.map((b) => `  • ${b}`).join("\n") +
        `\nSpeaker note: ${slide.speakerNote}\nVisual: ${slide.visualSuggestion}`
    )
    .join(separator);
}

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
    // Don't trim here — trimming on every keystroke eats spaces as you type
    onChange({ ...inputs, reasonsYes: value.split("\n") });
  }

  function setReasonsNo(value: string) {
    onChange({ ...inputs, reasonsNo: value.split("\n") });
  }

  const needCategories: Array<{ key: keyof AudienceNeeds; label: string }> = [
    { key: "core", label: "Core (Dept/Category) Needs" },
    { key: "business", label: "Business Needs" },
    { key: "personal", label: "Personal Needs" }
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
              <th>Specific Audience Need</th>
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
            placeholder="The specific YES the presenter needs from this meeting…"
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
            placeholder="One reason per line…"
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
            placeholder="One objection per line…"
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
            <th className="sl-col-section">Story Section</th>
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
            placeholder="Type your tool name…"
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

  const canExtract = notes.trim().length > 0 || documents.some(hasUsableText);

  // ── Autosave ───────────────────────────────────────────────────────────────

  const autosavePayload = {
    step,
    meetingLengthMinutes,
    minutesPerSlide,
    documents,
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
            sourceNotes: notes,
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
          setDocuments(s.documents ?? []);
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

  async function handleExtract() {
    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<ExtractResponse>("/api/creator-extract", {
        notes,
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
      setStorylineResult(null);
      setOutlineResult(null);
      setGapNotes("");
      setStep("properPrep");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleBuildStoryline() {
    if (!confirmedInputs) return;
    setIsWorking(true);
    setError("");
    try {
      const inputs = gapNotes.trim()
        ? {
            ...confirmedInputs,
            proofPoints: [
              ...confirmedInputs.proofPoints,
              ...gapNotes.split("\n").map((s) => s.trim()).filter(Boolean)
            ]
          }
        : confirmedInputs;
      const headers = await getRequestHeaders();
      const response = await postJson<StorylineResponse>("/api/creator-storyline", {
        extractedInputs: inputs
      }, { headers });
      setStorylineResult(response.storyline);
      setOutlineResult(null);
      setStep("storyline");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Storyline generation failed.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleBuildOutline(tool: string) {
    if (!storylineResult || !confirmedInputs) return;
    setTargetTool(tool);
    setShowToolModal(false);
    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<OutlineResponse>("/api/creator-outline", {
        storyline: storylineResult,
        targetTool: tool,
        audienceRole: confirmedInputs.audience.roleLevel,
        behavioralStyle: confirmedInputs.audience.behavioralStyle
      }, { headers });
      setOutlineResult(response);
      setStep("outline");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Outline generation failed.");
    } finally {
      setIsWorking(false);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document upload failed.");
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
          notes: "Pasted screenshot — will be analyzed for content."
        }
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screenshot paste failed.");
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
      setCopyMessage("Clipboard copy failed in this browser.");
    }
  }

  function handleStartOver() {
    setProjectId(createProjectId());
    setStep("input");
    setNotes("");
    setInputType("Unstructured notes");
    setMeetingLengthMinutes(45);
    setMinutesPerSlide(4);
    setDocuments([]);
    setDocumentContent("");
    setShowManualEntry(false);
    setGapNotes("");
    setExtractResult(null);
    setConfirmedInputs(null);
    setStorylineResult(null);
    setOutlineResult(null);
    setError("");
    setCopyMessage("");
    navigate("/creator", { replace: true });
  }

  // ── Step breadcrumb ────────────────────────────────────────────────────────

  const STEPS: Array<{ key: CreatorStep; label: string }> = [
    { key: "input", label: "Input" },
    { key: "properPrep", label: "Proper Prep" },
    { key: "storyline", label: "Storyline" },
    { key: "outline", label: "Slide Outline" }
  ];

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="page">
      <section className="app-hero">
        <p className="section-kicker">Story Creator</p>
        <h1 className="page-title">Build a clear, persuasive presentation storyline.</h1>
        <p className="page-subtitle">
          Start with any input, confirm your Proper Prep, and produce a structured storyline and slide outline.
        </p>
      </section>

      {/* Breadcrumb */}
      <div className="creator-steps-bar">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`creator-step${i === stepIndex ? " creator-step-active" : i < stepIndex ? " creator-step-done" : ""}`}
          >
            <span className="creator-step-num">{i + 1}</span>
            <span className="creator-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {error ? <p className="helper-error">{error}</p> : null}

      {/* ── STEP: INPUT ────────────────────────────────────────────────────── */}
      {step === "input" ? (
        <div className="app-cards-column">
          <section className="card dashed-card">
            <h3 className="card-title">Paste Notes / Prep</h3>
            <label className="field">
              <textarea
                rows={12}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onPaste={handleImagePaste}
                placeholder="Paste Proper Prep, rough notes, an existing outline, or unstructured thinking here… You can also paste a screenshot directly."
              />
            </label>
            <p className="helper-copy">
              Creator extracts and organizes inputs before generating. You'll review and edit everything before the storyline is built. Paste a screenshot to include an image.
            </p>
          </section>

          <section className="card dashed-card creator-grid-two">
            <div>
              <h3 className="card-title">What are you starting with?</h3>
              <label className="field">
                <select
                  value={inputType}
                  onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
                >
                  {INPUT_TYPES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <div className="creator-grid-two" style={{ marginTop: "1rem" }}>
                <label className="field field-inline">
                  <span>Meeting length (min)</span>
                  <input
                    type="number"
                    min={10}
                    step={5}
                    value={meetingLengthMinutes}
                    onChange={(e) => setMeetingLengthMinutes(Number(e.target.value) || 45)}
                  />
                </label>
                <label className="field field-inline">
                  <span>Minutes per slide</span>
                  <input
                    type="number"
                    min={2}
                    max={6}
                    step={1}
                    value={minutesPerSlide}
                    onChange={(e) => setMinutesPerSlide(Number(e.target.value) || 4)}
                  />
                </label>
              </div>
            </div>
            <div>
              <h3 className="card-title">Supporting Documents</h3>
              <label className="field">
                <span>Upload files</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,.tsv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                  onChange={(e) => void handleDocumentUpload(e.target.files)}
                />
              </label>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setShowManualEntry((v) => !v)}
                >
                  {showManualEntry ? "Hide manual entry" : "Add text manually"}
                </button>
                {isUploadingDocs ? <span className="helper-copy">Uploading…</span> : null}
              </div>
              {showManualEntry ? (
                <div className="manual-entry-panel">
                  <label className="field">
                    <span>Paste extracted text or summary</span>
                    <textarea
                      rows={5}
                      value={documentContent}
                      onChange={(e) => setDocumentContent(e.target.value)}
                      placeholder="Paste text from a Proper Prep form, memo, or deck excerpt…"
                    />
                  </label>
                  <div className="action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        if (!documentContent.trim()) return;
                        setDocuments((prev) => [
                          ...prev,
                          { label: "Pasted text", kind: "text", content: documentContent.trim() }
                        ]);
                        setDocumentContent("");
                        setShowManualEntry(false);
                      }}
                    >
                      Use This Text
                    </button>
                  </div>
                </div>
              ) : null}
              {documents.length > 0 ? (
                <div className="artifact-list">
                  {documents.map((doc) => (
                    <div
                      key={`${doc.label}-${doc.kind}-${doc.filename ?? "manual"}`}
                      className="artifact-card"
                    >
                      <strong>{doc.label}</strong>
                      <span>
                        {doc.kind.toUpperCase()}
                        {doc.filename ? ` · ${doc.filename}` : ""}
                      </span>
                      <p>
                        {(doc.content || doc.extractedText || "").slice(0, 180) ||
                          "File attached — no readable text extracted yet."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleExtract()}
              disabled={isWorking || isUploadingDocs || !canExtract}
            >
              {isWorking ? "Extracting…" : "Extract & Build Proper Prep →"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── STEP: PROPER PREP ──────────────────────────────────────────────── */}
      {step === "properPrep" && confirmedInputs ? (
        <div className="app-cards-column">
          <section className="card dashed-card">
            <div className="creator-step-header">
              <div>
                <h3 className="card-title">Proper Preparation</h3>
                <p className="helper-copy">
                  Review and edit every field below. This becomes the foundation for your storyline — the more specific you are, the stronger the output.
                </p>
              </div>
            </div>

            <PlanningWorksheet
              inputs={confirmedInputs}
              onChange={setConfirmedInputs}
            />
          </section>

          {extractResult?.gaps.length ? (
            <section className="card dashed-card">
              <h3 className="card-title">Gaps detected</h3>
              <ul className="list">
                {extractResult.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <label className="field">
                <span>Address gaps before generating (optional)</span>
                <textarea
                  rows={4}
                  value={gapNotes}
                  onChange={(e) => setGapNotes(e.target.value)}
                  placeholder="Add proof points, timeline assumptions, or context to sharpen the story…"
                />
              </label>
            </section>
          ) : null}

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => setStep("input")}>
              ← Back
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleBuildStoryline()}
              disabled={isWorking}
            >
              {isWorking ? "Building storyline…" : "Confirm & Build Storyline →"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── STEP: STORYLINE ────────────────────────────────────────────────── */}
      {step === "storyline" && storylineResult ? (
        <div className="app-cards-column">
          <section className="card dashed-card">
            <div className="creator-step-header">
              <div>
                <h3 className="card-title">Storyline</h3>
                <p className="helper-copy">
                  Click any cell to edit directly. Once this lands, you'll build the slide-by-slide outline.
                </p>
              </div>
            </div>
            <StorylineTable storyline={storylineResult} onChange={setStorylineResult} />
          </section>

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => setStep("properPrep")}>
              ← Back to Proper Prep
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleBuildStoryline()}
              disabled={isWorking}
            >
              {isWorking ? "Regenerating…" : "Regenerate"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowToolModal(true)}
              disabled={isWorking}
            >
              Build Slide Outline →
            </button>
          </div>

          {showToolModal ? (
            <ToolModal
              onConfirm={(tool) => void handleBuildOutline(tool)}
              onCancel={() => setShowToolModal(false)}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── STEP: OUTLINE ─────────────────────────────────────────────────── */}
      {step === "outline" && outlineResult ? (
        <div className="app-cards-column">
          <section className="card dashed-card">
            <div className="creator-step-header">
              <div>
                <h3 className="card-title">Slide Outline — {outlineResult.targetTool}</h3>
                <p className="helper-copy">
                  {outlineResult.outline.length} slides · Ready to paste into {outlineResult.targetTool}
                </p>
              </div>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleCopyOutline()}
                >
                  Copy all
                </button>
              </div>
            </div>
            {copyMessage ? <p className="helper-copy">{copyMessage}</p> : null}
            <SlideOutlineView outline={outlineResult.outline} toolTips={outlineResult.toolTips} />
          </section>

          <section className="card dashed-card">
            <h3 className="card-title">What format would you like to export?</h3>
            <div className="export-options">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleCopyOutline()}
              >
                Copy as text
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowToolModal(true)}
                disabled={isWorking}
              >
                Rebuild outline for a different tool
              </button>
              <span className="export-coming-soon">PPTX export — coming soon</span>
            </div>
          </section>

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => setStep("storyline")}>
              ← Back to Storyline
            </button>
            <button className="secondary-button" type="button" onClick={handleStartOver}>
              Start Over
            </button>
          </div>

          {showToolModal ? (
            <ToolModal
              onConfirm={(tool) => void handleBuildOutline(tool)}
              onCancel={() => setShowToolModal(false)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
