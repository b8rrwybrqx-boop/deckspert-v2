import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { postJson } from "../../src/api";
import { useAuth } from "../../src/auth/useAuth";

type BehavioralStyle = "thinker" | "director" | "relater" | "socializer" | "unknown";
type StoryComplexity = "low" | "medium" | "high";
type StorySection = keyof typeof STORY_SECTION_LABELS;
type ArtifactKind = "image" | "pdf" | "pptx" | "doc" | "text" | "video";

type AudienceProfile = {
  roleLevel: string | null;
  behavioralStyle: BehavioralStyle;
  behavioralStyleRationale?: string | null;
  assumptions: string[];
};

type AudienceNeeds = {
  core: string[];
  business: string[];
  personal: string[];
};

type CreatorInputs = {
  audience: AudienceProfile;
  needs: AudienceNeeds;
  desiredOutcome: string | null;
  reasonsYes: string[];
  reasonsNo: string[];
  situation: string | null;
  rootCause: string | null;
  draftBigIdea: string | null;
  proofPoints: string[];
  actions: string[];
  constraints: string[];
  metrics: string[];
  meetingLengthMinutes: number;
  minutesPerSlide: number;
  storyComplexity: StoryComplexity;
};

type SectionMap = {
  meetingLengthMinutes?: number | null;
  minutesPerSlide?: number | null;
  targetSlides?: number | null;
  totalSlides: number;
  slidesBySection: Record<StorySection, number>;
  rationale: string;
};

type ArtifactReference = {
  artifactId?: string;
  label: string;
  kind: ArtifactKind;
  sourceType?: "extractedText" | "visionSummary";
  notes?: string;
};

type DocumentInput = {
  label: string;
  kind: ArtifactKind;
  content: string;
  fileDataBase64?: string;
  filename?: string;
  contentType?: string;
  extractedText?: string;
  visionSummary?: string;
  notes?: string;
};

type ExtractResponse = {
  creatorVersion: "v2";
  extractedInputs: CreatorInputs;
  sectionMapProposal: SectionMap;
  gaps: string[];
  artifactsUsed?: ArtifactReference[];
};

type StorySlide = {
  slideIndex: number;
  section: StorySection;
  title: string;
  keyPoints: string[];
  visual: string;
  speakerNotes: string;
};

type StoryboardSelfCheck = {
  totalSlidesGenerated: number;
  sectionBreakdown: Record<StorySection, number>;
  withinTolerance: boolean;
  notes: string[];
};

type GenerateResponse = {
  creatorVersion: "v2";
  sectionMap: SectionMap;
  storyboard: StorySlide[];
  selfCheck: StoryboardSelfCheck;
  artifactsUsed?: ArtifactReference[];
};

type ReviseResponse = {
  creatorVersion: "v2";
  sectionMap: SectionMap;
  revisedStoryboard: StorySlide[];
  selfCheck: StoryboardSelfCheck;
  changeSummary: string[];
};

const INPUT_TYPES = [
  "Unstructured notes",
  "Proper Prep document",
  "Storyboard outline",
  "Existing slide deck",
  "Executive summary",
  "Strategy memo"
] as const;

const TEXT_LIKE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "tsv", "html"]);

const STORY_SECTION_LABELS = {
  openingGambit: "Opening Gambit",
  desiredOutcome: "Desired Outcome",
  situation: "Situation",
  rootCause: "Root Cause",
  bigIdea: "Big Idea",
  howItWorks: "How It Works",
  close: "Close"
} as const;

const STORY_SECTIONS = Object.keys(STORY_SECTION_LABELS) as StorySection[];

function inferDocumentKind(file: File): ArtifactKind {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (extension === "pdf") {
    return "pdf";
  }
  if (extension === "ppt" || extension === "pptx") {
    return "pptx";
  }
  if (extension === "doc" || extension === "docx") {
    return "doc";
  }
  return "text";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function readDocumentContent(
  file: File,
  kind: ArtifactKind
): Promise<{ content: string; fileDataBase64?: string; note?: string }> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (kind === "text" || file.type.startsWith("text/") || TEXT_LIKE_EXTENSIONS.has(extension)) {
    return { content: await file.text() };
  }

  if (kind === "pdf") {
    return {
      content: "",
      fileDataBase64: arrayBufferToBase64(await file.arrayBuffer()),
      note: "PDF text extraction may be partial depending on the file structure."
    };
  }

  return {
    content: "",
    fileDataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    note:
      kind === "pptx"
        ? "PowerPoint text will be extracted from slide content automatically."
        : kind === "doc" && extension === "docx"
          ? "Word text will be extracted from the .docx document automatically."
        : kind === "doc"
          ? "Legacy .doc files are not parsed yet. If possible, save as .docx first."
          : "This file is attached as source material, but text extraction may be limited."
  };
}

function listToTextareaValue(items: string[]): string {
  return items.join("\n");
}

function textareaToList(value: string): string[] {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCopyPayload(storyboard: StorySlide[]): string {
  return storyboard
    .map(
      (slide) =>
        `${slide.slideIndex}. ${STORY_SECTION_LABELS[slide.section]} — ${slide.title}\n` +
        `Key Points:\n${slide.keyPoints.map((point) => `- ${point}`).join("\n")}\n` +
        `Visual: ${slide.visual}\n` +
        `Speaker Notes: ${slide.speakerNotes}`
    )
    .join("\n\n");
}

function hasUsableDocumentText(document: DocumentInput): boolean {
  return Boolean(document.content.trim() || document.extractedText?.trim() || document.visionSummary?.trim());
}

function createCreatorProjectId() {
  return `creator-${crypto.randomUUID()}`;
}

function deriveProjectTitle(notes: string, extractResult: ExtractResponse | null, generateResult: GenerateResponse | null) {
  const generatedTitle = generateResult?.storyboard?.[0]?.title?.trim();
  if (generatedTitle) {
    return generatedTitle;
  }

  const bigIdea = extractResult?.extractedInputs.draftBigIdea?.trim();
  if (bigIdea) {
    return bigIdea.slice(0, 72);
  }

  const desiredOutcome = extractResult?.extractedInputs.desiredOutcome?.trim();
  if (desiredOutcome) {
    return desiredOutcome.slice(0, 72);
  }

  const firstLine = notes
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.slice(0, 72) : "Untitled storyboard";
}

function projectHasMeaningfulContent(notes: string, documents: DocumentInput[], extractResult: ExtractResponse | null, generateResult: GenerateResponse | null) {
  return Boolean(notes.trim() || documents.length || extractResult || generateResult);
}

export default function CreatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, getRequestHeaders } = useAuth();
  const [projectId, setProjectId] = useState(() => searchParams.get("projectId") ?? createCreatorProjectId());
  const [step, setStep] = useState<"input" | "confirm" | "generate">("input");
  const [notes, setNotes] = useState("");
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>("Unstructured notes");
  const [meetingLengthMinutes, setMeetingLengthMinutes] = useState(45);
  const [minutesPerSlide, setMinutesPerSlide] = useState(4);
  const [tone, setTone] = useState("executive, commercially sharp, and collaborative");
  const [documents, setDocuments] = useState<DocumentInput[]>([]);
  const [documentContent, setDocumentContent] = useState("");
  const [showManualTextEntry, setShowManualTextEntry] = useState(false);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const [gapNotes, setGapNotes] = useState("");
  const [revisionScope, setRevisionScope] = useState<"global" | "section" | "slide">("global");
  const [revisionSection, setRevisionSection] = useState<StorySection>("bigIdea");
  const [revisionSlideIndex, setRevisionSlideIndex] = useState(1);
  const [revisionText, setRevisionText] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);
  const [lastChangeSummary, setLastChangeSummary] = useState<string[]>([]);

  const canExtract =
    notes.trim().length > 0 ||
    documents.some((document) => hasUsableDocumentText(document));

  const unsupportedDocuments = documents.filter((document) => !hasUsableDocumentText(document));

  const currentSlideOptions = useMemo(
    () => generateResult?.storyboard.map((slide) => slide.slideIndex) ?? [],
    [generateResult]
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const requestedProjectId = searchParams.get("projectId");
    if (!requestedProjectId) {
      return;
    }

    void getRequestHeaders()
      .then((headers) =>
        postJson<{
      project: {
        id: string;
        inputType: string;
        sourceNotes: string;
        extractedInputsJson: ExtractResponse["extractedInputs"] | null;
        sectionMapJson: ExtractResponse["sectionMapProposal"] | null;
        storyboardJson:
          | {
              step: "input" | "confirm" | "generate";
              meetingLengthMinutes: number;
              minutesPerSlide: number;
              tone: string;
              documents: DocumentInput[];
              gapNotes: string;
              revisionText: string;
              revisionScope: "global" | "section" | "slide";
              revisionSection: StorySection;
              revisionSlideIndex: number;
              generateResult: GenerateResponse | null;
              lastChangeSummary: string[];
            }
          | null;
      };
    }>("/api/creator-project", {
      action: "get",
      projectId: requestedProjectId
        }, { headers })
      )
      .then((response) => {
        const project = response.project;
        setProjectId(project.id);
        setInputType(project.inputType as (typeof INPUT_TYPES)[number]);
        setNotes(project.sourceNotes);
        setExtractResult(
          project.extractedInputsJson && project.sectionMapJson
            ? {
                creatorVersion: "v2",
                extractedInputs: project.extractedInputsJson,
                sectionMapProposal: project.sectionMapJson,
                gaps: [],
                artifactsUsed: []
              }
            : null
        );
        setStep(project.storyboardJson?.step ?? "input");
        setMeetingLengthMinutes(project.storyboardJson?.meetingLengthMinutes ?? 45);
        setMinutesPerSlide(project.storyboardJson?.minutesPerSlide ?? 4);
        setTone(project.storyboardJson?.tone ?? "executive, commercially sharp, and collaborative");
        setDocuments(project.storyboardJson?.documents ?? []);
        setGapNotes(project.storyboardJson?.gapNotes ?? "");
        setRevisionText(project.storyboardJson?.revisionText ?? "");
        setRevisionScope(project.storyboardJson?.revisionScope ?? "global");
        setRevisionSection(project.storyboardJson?.revisionSection ?? "bigIdea");
        setRevisionSlideIndex(project.storyboardJson?.revisionSlideIndex ?? 1);
        setGenerateResult(project.storyboardJson?.generateResult ?? null);
        setLastChangeSummary(project.storyboardJson?.lastChangeSummary ?? []);
        setError("");
      })
      .catch(() => {
        return;
      });
  }, [searchParams, user]);

  useEffect(() => {
    if (!user || !projectHasMeaningfulContent(notes, documents, extractResult, generateResult)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void getRequestHeaders()
        .then((headers) =>
          postJson("/api/creator-project", {
            action: "upsert",
            project: {
              id: projectId,
              title: deriveProjectTitle(notes, extractResult, generateResult),
              inputType,
              sourceNotes: notes,
              extractedInputsJson: extractResult?.extractedInputs ?? null,
              sectionMapJson: extractResult?.sectionMapProposal ?? null,
              storyboardJson: {
                step,
                meetingLengthMinutes,
                minutesPerSlide,
                tone,
                documents,
                gapNotes,
                revisionText,
                revisionScope,
                revisionSection,
                revisionSlideIndex,
                generateResult,
                lastChangeSummary
              },
              status: step === "generate" ? "generated" : step === "confirm" ? "extracting" : "draft"
            }
          }, { headers })
        )
        .catch(() => {
          return;
        });
    }, 500);

    if (searchParams.get("projectId") !== projectId) {
      navigate(`/creator?projectId=${projectId}`, { replace: true });
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    user,
    projectId,
    step,
    notes,
    inputType,
    meetingLengthMinutes,
    minutesPerSlide,
    tone,
    documents,
    gapNotes,
    revisionText,
    revisionScope,
    revisionSection,
    revisionSlideIndex,
    extractResult,
    generateResult,
    lastChangeSummary,
    navigate,
    searchParams,
    getRequestHeaders
  ]);

  async function handleExtract() {
    if (!canExtract) {
      if (unsupportedDocuments.length > 0) {
        setError(
          `I attached ${unsupportedDocuments[0].filename ?? unsupportedDocuments[0].label}, but I could not extract usable text from it yet. Paste the source text, or upload a text-based export before extracting.`
        );
        return;
      }

      setError("Paste notes or add at least one supporting document before extracting.");
      return;
    }

    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<ExtractResponse>("/api/creator-extract", {
        notes,
        inputType,
        meetingLengthMinutes,
        minutesPerSlide,
        artifacts: documents.map((document) => ({
          label: document.label,
          kind: document.kind,
          fileDataBase64: document.fileDataBase64,
          filename: document.filename,
          contentType: document.contentType,
          content: document.content,
          extractedText: document.extractedText,
          visionSummary: document.visionSummary
        }))
      }, { headers });
      setExtractResult(response);
      setGenerateResult(null);
      setLastChangeSummary([]);
      setGapNotes("");
      setStep("confirm");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleGenerate() {
    if (!extractResult) {
      return;
    }

    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<GenerateResponse>("/api/creator-generate", {
        extractedInputs: {
          ...extractResult.extractedInputs,
          proofPoints: gapNotes.trim()
            ? [...extractResult.extractedInputs.proofPoints, ...textareaToList(gapNotes)]
            : extractResult.extractedInputs.proofPoints
        },
        sectionMap: extractResult.sectionMapProposal,
        tone,
        artifactsUsed: extractResult.artifactsUsed
      }, { headers });
      setGenerateResult(response);
      setLastChangeSummary([]);
      setStep("generate");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRevision() {
    if (!generateResult || !revisionText.trim()) {
      setError("Add a revision request before applying changes.");
      return;
    }

    setIsWorking(true);
    setError("");
    try {
      const headers = await getRequestHeaders();
      const response = await postJson<ReviseResponse>("/api/creator-revise", {
        sectionMap: generateResult.sectionMap,
        storyboard: generateResult.storyboard,
        revisionRequest: {
          revisionText,
          target:
            revisionScope === "global"
              ? { scope: "global" }
              : revisionScope === "section"
                ? { scope: "section", section: revisionSection }
                : { scope: "slide", slideIndex: revisionSlideIndex }
        }
      }, { headers });
      setGenerateResult({
        creatorVersion: response.creatorVersion,
        sectionMap: response.sectionMap,
        storyboard: response.revisedStoryboard,
        selfCheck: response.selfCheck
      });
      setLastChangeSummary(response.changeSummary);
      setRevisionText("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDocumentUpload(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setIsUploadingDocuments(true);
    setError("");

    try {
      const uploadedDocuments = await Promise.all(
        Array.from(files).map(async (file) => {
          const kind = inferDocumentKind(file);
          const { content, fileDataBase64, note } = await readDocumentContent(file, kind);

          return {
            label: file.name.replace(/\.[^.]+$/, ""),
            kind,
            filename: file.name,
            contentType: file.type || undefined,
            content,
            fileDataBase64,
            notes: note
          };
        })
      );

      const response = await postJson<{ artifacts: DocumentInput[] }>("/api/uploads", {
        artifacts: uploadedDocuments
      });

      setDocuments((current) => [...current, ...response.artifacts]);
      if (uploadedDocuments.some((document) => /proper prep|proper preparation|planning worksheet/i.test(document.label))) {
        setInputType("Proper Prep document");
      }
      setLastChangeSummary((current) => [
        ...current,
        `${uploadedDocuments.length} document${uploadedDocuments.length === 1 ? "" : "s"} added to Creator input.`
      ]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Document upload failed");
    } finally {
      setIsUploadingDocuments(false);
    }
  }

  function handleAddDocumentText() {
    if (!documentContent.trim()) {
      setError("Paste the text you want Creator to use.");
      return;
    }

    const inferredLabel =
      inputType === "Proper Prep document" ? "Pasted Proper Prep text" : "Pasted supporting text";

    setDocuments((current) => [
      ...current,
      {
        label: inferredLabel,
        kind: "text",
        content: documentContent.trim()
      }
    ]);
    setDocumentContent("");
    setShowManualTextEntry(false);
    setError("");
  }

  function handleStartOver() {
    const nextProjectId = createCreatorProjectId();
    setProjectId(nextProjectId);
    setStep("input");
    setNotes("");
    setInputType("Unstructured notes");
    setMeetingLengthMinutes(45);
    setMinutesPerSlide(4);
    setTone("executive, commercially sharp, and collaborative");
    setDocuments([]);
    setDocumentContent("");
    setShowManualTextEntry(false);
    setGapNotes("");
    setRevisionText("");
    setExtractResult(null);
    setGenerateResult(null);
    setLastChangeSummary([]);
    setError("");
    navigate("/creator", { replace: true });
  }

  async function handleCopyOutput() {
    if (!generateResult) {
      return;
    }

    const output = buildCopyPayload(generateResult.storyboard);
    try {
      await navigator.clipboard.writeText(output);
      setLastChangeSummary(["Storyboard copied to clipboard."]);
    } catch {
      setLastChangeSummary(["Clipboard copy failed in this browser session."]);
    }
  }

  return (
    <section className="page">
      <section className="app-hero">
        <p className="section-kicker">Story Creator</p>
        <h1 className="page-title">Build a clear, presentation-ready storyline.</h1>
        <p className="page-subtitle">
          Start with notes or Proper Prep content, confirm the story logic, and generate a storyboard built for the TPG flow.
        </p>
      </section>

      {error ? <p className="helper-error">{error}</p> : null}

      <div className="app-cards-column">
        <section className="card dashed-card">
          <h3 className="card-title">Paste Notes / Prep</h3>
          <label className="field">
            <textarea
              rows={12}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste Proper Prep, notes, a draft outline, or unstructured thinking here..."
            />
          </label>
          <p className="helper-copy">Creator works from unstructured inputs and organizes them before generation.</p>
        </section>

        <section className="card dashed-card">
          <h3 className="card-title">What are you starting with?</h3>
          <label className="field">
            <select value={inputType} onChange={(event) => setInputType(event.target.value as (typeof INPUT_TYPES)[number])}>
              {INPUT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <p className="helper-copy">This helps Creator interpret the material without constraining the final story.</p>
        </section>

        <section className="card dashed-card creator-grid-two">
          <div>
            <h3 className="card-title">Meeting Length</h3>
            <label className="field field-inline">
              <span>Meeting length (minutes)</span>
              <input
                type="number"
                min={10}
                step={5}
                value={meetingLengthMinutes}
                onChange={(event) => setMeetingLengthMinutes(Number(event.target.value) || 45)}
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
                onChange={(event) => setMinutesPerSlide(Number(event.target.value) || 4)}
              />
            </label>
            <p className="helper-copy">Baseline pacing uses about 3-5 minutes per slide. Creator starts with 4 and flexes within reason.</p>
          </div>
          <div>
            <h3 className="card-title">Supporting Documents</h3>
            <label className="field">
              <span>Upload files</span>
              <input
                type="file"
                multiple
                accept=".txt,.md,.csv,.json,.tsv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                onChange={(event) => void handleDocumentUpload(event.target.files)}
              />
            </label>
            <p className="helper-copy">
              File names come from the upload automatically. Text-based files, PowerPoint files, and modern .docx files can be extracted automatically. PDFs may vary by file structure, and legacy .doc files may still need a text export.
            </p>
            <div className="action-row">
              <button
                className="secondary-button"
                onClick={() => setShowManualTextEntry((current) => !current)}
                type="button"
              >
                {showManualTextEntry ? "Hide Manual Text Entry" : "Add Text Manually Instead"}
              </button>
              {isUploadingDocuments ? <span className="helper-copy">Uploading documents...</span> : null}
            </div>
            {showManualTextEntry ? (
              <div className="manual-entry-panel">
                <label className="field">
                  <span>Paste extracted text or summary</span>
                  <textarea
                    rows={5}
                    value={documentContent}
                    onChange={(event) => setDocumentContent(event.target.value)}
                    placeholder="Paste the text from a Proper Prep form, memo, deck excerpt, or screenshot summary..."
                  />
                </label>
                <div className="action-row">
                  <button className="secondary-button" onClick={handleAddDocumentText} type="button">
                    Use This Text
                  </button>
                </div>
              </div>
            ) : null}
            {documents.length ? (
              <div className="artifact-list">
                {documents.map((document) => (
                  <div key={`${document.label}-${document.kind}-${document.filename ?? "manual"}`} className="artifact-card">
                    <strong>{document.label}</strong>
                    <span>{document.kind.toUpperCase()}{document.filename ? ` · ${document.filename}` : ""}</span>
                    <p>
                      {document.content || document.extractedText || document.visionSummary
                        ? `${(document.content || document.extractedText || document.visionSummary || "").slice(0, 180)}${
                            (document.content || document.extractedText || document.visionSummary || "").length > 180 ? "..." : ""
                          }`
                        : "File attached, but no readable text was extracted yet."}
                    </p>
                    {document.notes ? <p className="helper-copy">{document.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="helper-copy">Upload a Proper Prep worksheet, memo, or notes file here. This is the main document intake path for Creator now.</p>
            )}
            {unsupportedDocuments.length ? (
              <p className="helper-error">
                {unsupportedDocuments.length === 1
                  ? `The uploaded file ${unsupportedDocuments[0].filename ?? unsupportedDocuments[0].label} was attached, but no usable text was extracted from it.`
                  : "Some uploaded files were attached, but no usable text was extracted from them yet."}{" "}
                Add the text manually or upload a text-based export.
              </p>
            ) : null}
          </div>
        </section>

        <div className="action-row">
          <button className="primary-button" onClick={() => void handleExtract()} disabled={isWorking || isUploadingDocuments || !canExtract}>
            {isWorking && step === "input" ? "Extracting..." : "Extract & Build Section Map"}
          </button>
        </div>

        {extractResult ? (
          <>
            <section className="card dashed-card">
              <h3 className="card-title">Section Map (Outline)</h3>
              <p className="helper-copy">
                Meeting: <strong>{extractResult.sectionMapProposal.meetingLengthMinutes ?? meetingLengthMinutes} min</strong> · Baseline pacing:{" "}
                <strong>{extractResult.sectionMapProposal.minutesPerSlide ?? minutesPerSlide} min/slide</strong> · Target:{" "}
                <strong>{extractResult.sectionMapProposal.targetSlides ?? extractResult.sectionMapProposal.totalSlides}</strong> · Proposed:{" "}
                <strong>{extractResult.sectionMapProposal.totalSlides}</strong>
              </p>
              <ul className="list">
                {Object.entries(extractResult.sectionMapProposal.slidesBySection).map(([section, count]) => (
                  <li key={section}>
                    <strong>{STORY_SECTION_LABELS[section as StorySection]}:</strong> {count}
                  </li>
                ))}
              </ul>
              <p className="helper-copy">{extractResult.sectionMapProposal.rationale}</p>
            </section>

            <section className="card dashed-card">
              <h3 className="card-title">Key Inputs (Review)</h3>
              <div className="creator-grid-two">
                <label className="field">
                  <span>Audience</span>
                  <input
                    value={extractResult.extractedInputs.audience.roleLevel ?? ""}
                    onChange={(event) =>
                      setExtractResult((current) =>
                        current
                          ? {
                              ...current,
                              extractedInputs: {
                                ...current.extractedInputs,
                                audience: {
                                  ...current.extractedInputs.audience,
                                  roleLevel: event.target.value
                                }
                              }
                            }
                          : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Behavioral style rationale</span>
                  <input
                    value={extractResult.extractedInputs.audience.behavioralStyleRationale ?? ""}
                    onChange={(event) =>
                      setExtractResult((current) =>
                        current
                          ? {
                              ...current,
                              extractedInputs: {
                                ...current.extractedInputs,
                                audience: {
                                  ...current.extractedInputs.audience,
                                  behavioralStyleRationale: event.target.value
                                }
                              }
                            }
                          : current
                      )
                    }
                  />
                </label>
              </div>
              <div className="creator-grid-two">
                <div className="result-block">
                  <strong>Core needs</strong>
                  {"\n"}
                  {extractResult.extractedInputs.needs.core.length
                    ? extractResult.extractedInputs.needs.core.map((item) => `• ${item}`).join("\n")
                    : "• None identified yet"}
                </div>
                <div className="result-block">
                  <strong>Business needs</strong>
                  {"\n"}
                  {extractResult.extractedInputs.needs.business.length
                    ? extractResult.extractedInputs.needs.business.map((item) => `• ${item}`).join("\n")
                    : "• None identified yet"}
                </div>
              </div>
              <div className="result-block">
                <strong>Personal needs</strong>
                {"\n"}
                {extractResult.extractedInputs.needs.personal.length
                  ? extractResult.extractedInputs.needs.personal.map((item) => `• ${item}`).join("\n")
                  : "• None identified yet"}
              </div>
              <label className="field">
                <span>Desired Outcome (the yes)</span>
                <textarea
                  rows={3}
                  value={extractResult.extractedInputs.desiredOutcome ?? ""}
                  onChange={(event) =>
                    setExtractResult((current) =>
                      current
                        ? {
                            ...current,
                            extractedInputs: {
                              ...current.extractedInputs,
                              desiredOutcome: event.target.value
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Big Idea (belief shift)</span>
                <textarea
                  rows={3}
                  value={extractResult.extractedInputs.draftBigIdea ?? ""}
                  onChange={(event) =>
                    setExtractResult((current) =>
                      current
                        ? {
                            ...current,
                            extractedInputs: {
                              ...current.extractedInputs,
                              draftBigIdea: event.target.value
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
              <div className="creator-grid-two">
                <label className="field">
                  <span>Reasons to say yes</span>
                  <textarea
                    rows={4}
                    value={listToTextareaValue(extractResult.extractedInputs.reasonsYes)}
                    onChange={(event) =>
                      setExtractResult((current) =>
                        current
                          ? {
                              ...current,
                              extractedInputs: {
                                ...current.extractedInputs,
                                reasonsYes: textareaToList(event.target.value)
                              }
                            }
                          : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Likely objections</span>
                  <textarea
                    rows={4}
                    value={listToTextareaValue(extractResult.extractedInputs.reasonsNo)}
                    onChange={(event) =>
                      setExtractResult((current) =>
                        current
                          ? {
                              ...current,
                              extractedInputs: {
                                ...current.extractedInputs,
                                reasonsNo: textareaToList(event.target.value)
                              }
                            }
                          : current
                      )
                    }
                  />
                </label>
              </div>
            </section>

            <section className="card dashed-card">
              <h3 className="card-title">Detected Gaps (for awareness)</h3>
              {extractResult.gaps.length ? (
                <ul className="list">
                  {extractResult.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              ) : (
                <p className="helper-copy">No major gaps surfaced in extraction.</p>
              )}
              <label className="field">
                <span>Address gaps before generating (optional)</span>
                <textarea
                  rows={5}
                  value={gapNotes}
                  onChange={(event) => setGapNotes(event.target.value)}
                  placeholder="Add proof points, timeline assumptions, integration notes, or risk mitigations to incorporate before generation."
                />
              </label>
            </section>

            <section className="card dashed-card">
              <h3 className="card-title">Generation Controls</h3>
              <label className="field">
                <span>Storyboarding tone</span>
                <input value={tone} onChange={(event) => setTone(event.target.value)} />
              </label>
              <div className="action-row">
                <button className="secondary-button" onClick={() => setStep("input")} type="button">
                  Back
                </button>
                <button className="primary-button" onClick={() => void handleGenerate()} disabled={isWorking}>
                  {isWorking && step !== "generate" ? "Generating..." : "Confirm & Generate Storyboard"}
                </button>
              </div>
            </section>
          </>
        ) : null}

        {generateResult ? (
          <>
            <section className="card dashed-card">
              <h3 className="card-title">Storyboard</h3>
              <div className="storyboard-list">
                {generateResult.storyboard.map((slide) => (
                  <article key={slide.slideIndex} className="storyboard-card dashed-card">
                    <h4>
                      {slide.slideIndex}. {STORY_SECTION_LABELS[slide.section]} — {slide.title}
                    </h4>
                    <strong>Key Points</strong>
                    <ul className="list">
                      {slide.keyPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <p><strong>Visual:</strong> {slide.visual}</p>
                    <p><strong>Speaker Notes:</strong> {slide.speakerNotes}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="card dashed-card">
              <h3 className="card-title">Revision Controls</h3>
              <div className="creator-grid-three">
                <label className="field">
                  <span>Target</span>
                  <select value={revisionScope} onChange={(event) => setRevisionScope(event.target.value as "global" | "section" | "slide")}>
                    <option value="global">Global</option>
                    <option value="section">Section</option>
                    <option value="slide">Slide</option>
                  </select>
                </label>
                {revisionScope === "section" ? (
                  <label className="field">
                    <span>Section</span>
                    <select value={revisionSection} onChange={(event) => setRevisionSection(event.target.value as StorySection)}>
                      {STORY_SECTIONS.map((section) => (
                        <option key={section} value={section}>
                          {STORY_SECTION_LABELS[section]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {revisionScope === "slide" ? (
                  <label className="field">
                    <span>Slide</span>
                    <select
                      value={revisionSlideIndex}
                      onChange={(event) => setRevisionSlideIndex(Number(event.target.value))}
                    >
                      {currentSlideOptions.map((index) => (
                        <option key={index} value={index}>
                          Slide {index}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <label className="field">
                <span>Revision request</span>
                <textarea
                  rows={4}
                  value={revisionText}
                  onChange={(event) => setRevisionText(event.target.value)}
                  placeholder="Example: Strengthen the Big Idea belief shift and add one concrete proof placeholder. Keep slide count unchanged."
                />
              </label>
              <div className="action-row">
                <button className="primary-button" onClick={() => void handleRevision()} disabled={isWorking || !revisionText.trim()}>
                  {isWorking && step === "generate" ? "Applying..." : "Apply Revision"}
                </button>
                <button className="secondary-button" onClick={() => void handleCopyOutput()} type="button">
                  Copy Output
                </button>
                <button className="secondary-button" onClick={handleStartOver} type="button">
                  Start Over
                </button>
              </div>
              {lastChangeSummary.length ? (
                <div className="result-block">
                  <strong>Latest updates</strong>
                  {"\n"}
                  {lastChangeSummary.map((item) => `• ${item}`).join("\n")}
                </div>
              ) : null}
              <div className="result-block">
                <strong>Storyboard self-check</strong>
                {"\n"}
                {`Slides generated: ${generateResult.selfCheck.totalSlidesGenerated}\n`}
                {`Within tolerance: ${generateResult.selfCheck.withinTolerance ? "Yes" : "No"}\n`}
                {Object.entries(generateResult.selfCheck.sectionBreakdown)
                  .map(([section, count]) => `${STORY_SECTION_LABELS[section as StorySection]}: ${count}`)
                  .join("\n")}
                {generateResult.selfCheck.notes.length ? `\n\n${generateResult.selfCheck.notes.map((note) => `• ${note}`).join("\n")}` : ""}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
