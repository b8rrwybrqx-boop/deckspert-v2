import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { upload } from "@vercel/blob/client";
import { postJson } from "../../src/api";
import { useAuth } from "../../src/auth/useAuth";

type ArtifactKind = "image" | "pdf" | "pptx" | "doc" | "text" | "video";

type CoachDiagnosis = {
  issueType: "bigIdea" | "situation" | "rootCause" | "wiifm" | "ask" | "flow" | "audience" | "general";
  summary: string;
  likelyCauses: string[];
  suggestedFixes: string[];
};

type CoachReframe = {
  label: string;
  text: string;
  whyItWorks: string;
};

type DoctrineHighlight = {
  title: string;
  guidance: string;
};

type CoachAttachment = {
  label: string;
  kind: ArtifactKind;
  filename?: string;
  text?: string;
  notes?: string;
  sourceType?: "content" | "extractedText" | "visionSummary";
  // Public blob URL for image attachments, so the message bubble can show the
  // pasted screenshot as a thumbnail instead of dumping the vision transcription.
  url?: string;
};

type CoachResponse = {
  mode: "general" | "evaluation";
  reply: string;
  diagnosis?: CoachDiagnosis;
  evaluation?: CoachEvaluation;
  reframes: CoachReframe[];
  doctrineHighlights: DoctrineHighlight[];
  suggestedQuestions: string[];
  suggestedNextStep?: string;
};

type CoachEvaluationSection =
  | "titleSlide"
  | "openingGambit"
  | "desiredOutcome"
  | "situationRootCause"
  | "bigIdea"
  | "howItWorks"
  | "wiifm"
  | "close"
  | "actionsNextSteps";

type CoachEvaluation = {
  focus: "story" | "content";
  storyRead: {
    summary: string;
    followsKnowBelieveDo: "yes" | "partially" | "no";
    missingOrWeakSections: string[];
    structuralObservations: string[];
  };
  sectionScores: Array<{
    section: CoachEvaluationSection;
    score: number;
    rationale: string;
    recommendation: string;
  }>;
  slideQualityRead: {
    simplicity: string;
    easeOfUnderstanding: string;
    visualAppeal: string;
    readability: string;
    titleEffectiveness: string;
    notableSlides: string[];
  };
  slideReviews: Array<{
    slideLabel: string;
    simplicity: string;
    easeOfUnderstanding: string;
    visualAppeal: string;
    readability: string;
    titleEffectiveness: string;
    whatIsWorking: string;
    weakness: string;
    opportunity: string;
  }>;
  topPriorities: Array<{
    theme: string;
    priority: string;
  }>;
};

type Message = {
  role: "assistant" | "user";
  text: string;
  attachments?: CoachAttachment[];
  diagnosis?: CoachDiagnosis;
  evaluation?: CoachEvaluation;
  reframes?: CoachReframe[];
  doctrineHighlights?: DoctrineHighlight[];
  suggestions?: string[];
  nextStep?: string;
};

function createThreadId() {
  return `coach-${crypto.randomUUID()}`;
}

const TEXT_LIKE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "tsv", "html"]);

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

async function uploadDocumentDirect(
  file: File,
  handleUploadUrl = "/api/upload-token"
): Promise<{ url: string; pathname: string; contentType: string }> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType
  };
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
      note: "StoryCoach will read what it can from this PDF. If the file is image-heavy, a text version may work better."
    };
  }

  return {
    content: "",
    fileDataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    note:
      kind === "pptx"
        ? "StoryCoach will read the slide content."
        : kind === "doc" && extension === "docx"
          ? "StoryCoach will read the document text."
          : kind === "doc"
            ? "Older .doc files aren’t supported yet. Save as .docx and add it again."
            : "StoryCoach will use this as source material, though it may not read all of the content."
  };
}

function buildAttachmentPreview(attachment: CoachAttachment): string {
  return (attachment.text ?? "").slice(0, 220);
}

function deriveThreadTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.text.trim();
  if (!firstUserMessage) {
    return "Untitled StoryCoach conversation";
  }

  return firstUserMessage.slice(0, 72);
}

function formatIssueLabel(issueType: CoachDiagnosis["issueType"]) {
  const labels: Record<CoachDiagnosis["issueType"], string> = {
    bigIdea: "Big Idea",
    situation: "Situation framing",
    rootCause: "Root cause",
    wiifm: "Audience value",
    ask: "Ask and close",
    flow: "Story flow",
    audience: "Audience alignment",
    general: "Story focus"
  };

  return labels[issueType];
}

function isCoachEvaluation(value: unknown): value is CoachEvaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "storyRead" in value && "sectionScores" in value && "slideQualityRead" in value;
}

function formatEvaluationSectionLabel(section: CoachEvaluationSection) {
  const labels: Record<CoachEvaluationSection, string> = {
    titleSlide: "Title Slide",
    openingGambit: "Opening Gambit",
    desiredOutcome: "Desired Outcome",
    situationRootCause: "Situation / Root Cause",
    bigIdea: "Big Idea",
    howItWorks: "How It Works",
    wiifm: "WIIFM",
    close: "Close",
    actionsNextSteps: "Actions & Next Steps"
  };

  return labels[section];
}

function buildEvaluationTranscript(evaluation: CoachEvaluation) {
  const sections = evaluation.sectionScores
    .map((item) => [
      `${formatEvaluationSectionLabel(item.section)} · ${item.score}/5`,
      `Rationale: ${item.rationale}`,
      `Recommendation: ${item.recommendation}`
    ].join("\n"))
    .join("\n\n");

  const slideReviews = evaluation.slideReviews
    .slice(0, 12)
    .map((item) => [
      item.slideLabel,
      `Working: ${item.whatIsWorking}`,
      `Weakness: ${item.weakness}`,
      `Opportunity: ${item.opportunity}`
    ].join("\n"))
    .join("\n\n");

  const priorities = evaluation.topPriorities
    .map((item) => `- ${item.theme}: ${item.priority}`)
    .join("\n");

  return [
    "Prior Coach evaluation context:",
    `Focus: ${evaluation.focus}`,
    `Story summary: ${evaluation.storyRead.summary}`,
    evaluation.storyRead.structuralObservations.length
      ? `Structural observations:\n${evaluation.storyRead.structuralObservations.map((item) => `- ${item}`).join("\n")}`
      : "",
    sections ? `Section scores:\n${sections}` : "",
    slideReviews ? `Slide-level notes:\n${slideReviews}` : "",
    priorities ? `Top priorities:\n${priorities}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildCoachRequestContent(message: Message) {
  if (message.role !== "assistant" || !message.evaluation) {
    return message.text;
  }

  return `${message.text}\n\n${buildEvaluationTranscript(message.evaluation)}`;
}

export default function CoachPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, getRequestHeaders } = useAuth();
  const [threadId, setThreadId] = useState(() => searchParams.get("threadId") ?? createThreadId());
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "What would you like to improve? Ask about your audience, opening, Big Idea, story flow, slide language, audience value, or close. You can also add a deck, document, or screenshot."
    }
  ]);
  const [message, setMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<CoachAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    const requestedThreadId = searchParams.get("threadId");
    if (!requestedThreadId) {
      return;
    }

    void getRequestHeaders()
      .then((headers) =>
        postJson<{
      thread: {
        id: string;
        messages: Array<{
          role: "assistant" | "user";
          text: string;
          diagnosisJson?: CoachDiagnosis | CoachEvaluation;
          reframesJson?: CoachReframe[] | CoachAttachment[];
          attachmentsJson?: CoachAttachment[];
          doctrineHighlightsJson?: DoctrineHighlight[];
          suggestionsJson?: string[];
          nextStep?: string | null;
        }>;
      };
    }>("/api/coach-thread", {
      action: "get",
      threadId: requestedThreadId
        }, { headers })
      )
      .then((response) => {
        setThreadId(response.thread.id);
        setMessages(
          response.thread.messages.map((message) => ({
            role: message.role,
            text: message.text,
            attachments: message.attachmentsJson ?? (message.role === "user" ? (message.reframesJson as CoachAttachment[] | undefined) : undefined),
            diagnosis: isCoachEvaluation(message.diagnosisJson) ? undefined : message.diagnosisJson,
            evaluation: isCoachEvaluation(message.diagnosisJson) ? message.diagnosisJson : undefined,
            reframes: message.role === "assistant" ? (message.reframesJson as CoachReframe[] | undefined) : undefined,
            doctrineHighlights: message.doctrineHighlightsJson,
            suggestions: message.suggestionsJson,
            nextStep: message.nextStep ?? undefined
          }))
        );
        setError("");
      })
      .catch(() => {
        return;
      });
  }, [searchParams, user]);

  useEffect(() => {
    if (!user || messages.length <= 1) {
      return;
    }

    const title = deriveThreadTitle(messages);
    const timeoutId = window.setTimeout(() => {
      void getRequestHeaders()
        .then((headers) =>
          postJson("/api/coach-thread", {
            action: "upsert",
            thread: {
              id: threadId,
              title,
              messages: messages.map((message) => ({
                role: message.role,
                text: message.text,
                attachments: message.attachments,
                diagnosis: message.evaluation ?? message.diagnosis,
                reframes: message.reframes,
                doctrineHighlights: message.doctrineHighlights,
                suggestions: message.suggestions,
                nextStep: message.nextStep
              }))
            }
          }, { headers })
        )
        .catch(() => {
          return;
        });
    }, 500);

    if (searchParams.get("threadId") !== threadId) {
      navigate(`/platform/coach?threadId=${threadId}`, { replace: true });
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [messages, navigate, searchParams, threadId, user, getRequestHeaders]);

  const quickPrompts = useMemo(
    () => [
      "How can I make this message clearer?",
      "What would make this section more persuasive?",
      "Where does this feel thin or confusing?"
    ],
    []
  );

  async function handleAttachmentUpload(files: FileList | File[] | null) {
    if (!files?.length) {
      return;
    }

    setIsUploadingAttachments(true);
    setError("");

    try {
      const uploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const kind = inferDocumentKind(file);
          const { content, fileDataBase64, note } = await readDocumentContent(file, kind);

          if (fileDataBase64) {
            const blob = await uploadDocumentDirect(file);
            return {
              label: file.name.replace(/\.[^.]+$/, ""),
              kind,
              filename: file.name,
              contentType: blob.contentType || file.type || undefined,
              sourceUrl: blob.url,
              content,
              notes: note
            };
          }

          return {
            label: file.name.replace(/\.[^.]+$/, ""),
            kind,
            filename: file.name,
            contentType: file.type || undefined,
            content,
            notes: note
          };
        })
      );

      const response = await postJson<{
        artifacts: Array<{
          label: string;
          kind: ArtifactKind;
          filename?: string;
          content?: string;
          extractedText?: string;
          visionSummary?: string;
          notes?: string;
        }>;
      }>("/api/uploads", {
        artifacts: uploads
      });

      const nextAttachments = response.artifacts.map((artifact, index) => {
        // uploads is 1:1 and in order with response.artifacts; only the
        // image/binary branch carries a blob sourceUrl.
        const source = uploads[index];
        const url = source && "sourceUrl" in source ? source.sourceUrl : undefined;
        return {
          label: artifact.label,
          kind: artifact.kind,
          filename: artifact.filename,
          // Use || not ?? so an empty content string (always "" for images) falls
          // through to the vision summary instead of swallowing it.
          text: artifact.extractedText || artifact.visionSummary || artifact.content || "",
          notes: artifact.notes,
          sourceType: artifact.extractedText
            ? "extractedText"
            : artifact.visionSummary
              ? "visionSummary"
              : "content",
          url
        } satisfies CoachAttachment;
      });

      setPendingAttachments((current) => [...current, ...nextAttachments]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "We couldn’t add that file. Try again, or paste the relevant content into the message box.");
    } finally {
      setIsUploadingAttachments(false);
    }
  }

  function removePendingAttachment(indexToRemove: number) {
    setPendingAttachments((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function handleSubmit() {
    const trimmed = message.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isLoading || isUploadingAttachments) {
      return;
    }

    const nextUserMessage: Message = {
      role: "user",
      text: trimmed || "Here is source material I want feedback on. Please review it and tell me how to improve it.",
      attachments: pendingAttachments
    };
    setMessages((current) => [...current, nextUserMessage]);
    setMessage("");
    setPendingAttachments([]);
    setError("");
    setIsLoading(true);

    try {
      const payloadMessages = [...messages, nextUserMessage].map((item) => ({
        role: item.role,
        content: buildCoachRequestContent(item),
        attachments: item.attachments ?? []
      }));
      const headers = await getRequestHeaders();
      const data = await postJson<CoachResponse>("/api/coach", {
        messages: payloadMessages
      }, { headers });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.reply,
          diagnosis: data.diagnosis,
          evaluation: data.evaluation,
          reframes: data.reframes,
          doctrineHighlights: data.doctrineHighlights,
          suggestions: data.suggestedQuestions,
          nextStep: data.suggestedNextStep
        }
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "StoryCoach couldn’t respond to that request. Your message and attachments are still here—try again in a moment.");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "I hit an error generating coaching. Please try again. If it persists, verify the server and OpenAI configuration."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="page page-coach">
      <section className="app-hero">
        <p className="section-kicker">StoryLab · StoryCoach</p>
        <h1 className="page-title">Get focused help with a presentation challenge</h1>
        <p className="page-subtitle">
          Ask a question or add a slide, passage, screenshot, or deck excerpt. StoryCoach will diagnose the issue, explain why it matters, and suggest specific ways to strengthen it.
        </p>
        {/* StoryCoach solves one focused problem; StoryCheck assesses the whole
            piece. Without this, users bring an entire deck here and expect a report. */}
        <p className="helper-copy">
          Looking for a structured review of an entire plan, storyline, or deck? Use StoryCheck.
        </p>
      </section>

      <div className="coach-quick-prompts">
        {quickPrompts.map((prompt) => (
          <button key={prompt} className="secondary-button quick-prompt-button" onClick={() => setMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      {error ? <p className="helper-error">{error}</p> : null}

      <div className="chat-panel">
        <div className="chat-messages">
          {messages.map((entry, index) => (
            <div key={`${entry.role}-${index}`} className={`chat-message chat-${entry.role}`}>
              <div>{entry.text}</div>
              {entry.attachments?.length ? (
                <div className="coach-attachment-list">
                  {entry.attachments.map((attachment) => {
                    const preview = buildAttachmentPreview(attachment);
                    return (
                      <div key={`${attachment.label}-${attachment.filename ?? attachment.kind}`} className="coach-attachment-card">
                        <strong>{attachment.label}</strong>
                        <span>{attachment.kind.toUpperCase()}{attachment.filename ? ` · ${attachment.filename}` : ""}</span>
                        {attachment.kind === "image" && attachment.url ? (
                        <img
                          className="coach-attachment-thumb"
                          src={attachment.url}
                          alt={attachment.filename ?? attachment.label}
                        />
                      ) : (
                        <p>{preview || "Attached as source material, but no readable text was extracted yet."}</p>
                      )}
                        {attachment.notes ? <div className="helper-copy">{attachment.notes}</div> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {entry.diagnosis ? (
                !entry.evaluation ? (
                <div className="coach-block">
                  <div className="coach-block-title">What I&apos;m seeing</div>
                  <div><strong>{formatIssueLabel(entry.diagnosis.issueType)}</strong>: {entry.diagnosis.summary}</div>
                  <div className="coach-sublist">
                    <strong>What may be driving it</strong>
                    <ul>
                      {entry.diagnosis.likelyCauses.map((cause) => (
                        <li key={cause}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="coach-sublist">
                    <strong>How I&apos;d strengthen it</strong>
                    <ul>
                      {entry.diagnosis.suggestedFixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                ) : null
              ) : null}
              {entry.evaluation ? (
                <>
                  {entry.evaluation.focus === "content" ? (
                    <>
                      <div className="coach-block">
                        <div className="coach-block-title">Compelling Content Read</div>
                        <div className="coach-sublist">
                          <strong>Simplicity</strong>
                          <ul><li>{entry.evaluation.slideQualityRead.simplicity}</li></ul>
                        </div>
                        <div className="coach-sublist">
                          <strong>Ease of understanding</strong>
                          <ul><li>{entry.evaluation.slideQualityRead.easeOfUnderstanding}</li></ul>
                        </div>
                        <div className="coach-sublist">
                          <strong>Visual appeal</strong>
                          <ul><li>{entry.evaluation.slideQualityRead.visualAppeal}</li></ul>
                        </div>
                        <div className="coach-sublist">
                          <strong>Readability</strong>
                          <ul><li>{entry.evaluation.slideQualityRead.readability}</li></ul>
                        </div>
                        <div className="coach-sublist">
                          <strong>Title effectiveness</strong>
                          <ul><li>{entry.evaluation.slideQualityRead.titleEffectiveness}</li></ul>
                        </div>
                        {entry.evaluation.slideQualityRead.notableSlides.length ? (
                          <div className="coach-sublist">
                            <strong>Notable slides</strong>
                            <ul>
                              {entry.evaluation.slideQualityRead.notableSlides.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>

                      {entry.evaluation.slideReviews.length ? (
                        <div className="coach-block">
                          <div className="coach-block-title">Slide-by-Slide Feedback</div>
                          <div className="coach-reframes">
                            {entry.evaluation.slideReviews.map((item) => (
                              <div key={item.slideLabel} className="coach-principle-card">
                                <strong>{item.slideLabel}</strong>
                                <div className="coach-sublist">
                                  <strong>Simplicity</strong>
                                  <ul><li>{item.simplicity}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>Ease of understanding</strong>
                                  <ul><li>{item.easeOfUnderstanding}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>Visual appeal</strong>
                                  <ul><li>{item.visualAppeal}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>Readability</strong>
                                  <ul><li>{item.readability}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>Title effectiveness</strong>
                                  <ul><li>{item.titleEffectiveness}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>What&apos;s working</strong>
                                  <ul><li>{item.whatIsWorking}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>What&apos;s weak</strong>
                                  <ul><li>{item.weakness}</li></ul>
                                </div>
                                <div className="coach-sublist">
                                  <strong>What to improve</strong>
                                  <ul><li>{item.opportunity}</li></ul>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {entry.evaluation.topPriorities.length ? (
                        <div className="coach-block">
                          <div className="coach-block-title">Top Priorities</div>
                          <div className="coach-reframes">
                            {entry.evaluation.topPriorities.map((item) => (
                              <div key={`${item.theme}-${item.priority}`} className="coach-principle-card">
                                <strong>{item.theme}</strong>
                                <div>{item.priority}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </>
                  ) : (
                    <>
                  <div className="coach-block">
                    <div className="coach-block-title">Story Read</div>
                    <div>{entry.evaluation.storyRead.summary}</div>
                    {entry.evaluation.storyRead.missingOrWeakSections.length ? (
                      <div className="coach-sublist">
                        <strong>Missing or weak sections</strong>
                        <ul>
                          {entry.evaluation.storyRead.missingOrWeakSections.map((item) => (
                            <li key={item}>{formatEvaluationSectionLabel(item as CoachEvaluationSection)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {entry.evaluation.storyRead.structuralObservations.length ? (
                      <div className="coach-sublist">
                        <strong>Structural observations</strong>
                        <ul>
                          {entry.evaluation.storyRead.structuralObservations.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="coach-block">
                    <div className="coach-block-title">Section Evaluation</div>
                    <div className="coach-reframes">
                      {entry.evaluation.sectionScores.map((item) => (
                        <div key={item.section} className="coach-principle-card">
                          <strong>{formatEvaluationSectionLabel(item.section)} · {item.score}/5</strong>
                          <div>{item.rationale}</div>
                          <div className="coach-sublist">
                            <strong>Coach recommendation to strengthen</strong>
                            <ul>
                              <li>{item.recommendation}</li>
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {entry.evaluation.topPriorities.length ? (
                    <div className="coach-block">
                      <div className="coach-block-title">Top Priorities</div>
                      <div className="coach-reframes">
                        {entry.evaluation.topPriorities.map((item) => (
                          <div key={`${item.theme}-${item.priority}`} className="coach-principle-card">
                            <strong>{item.theme}</strong>
                            <div>{item.priority}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                    </>
                  )}
                </>
              ) : null}
              {entry.reframes?.length ? (
                <div className="coach-block">
                  <div className="coach-block-title">Options to consider</div>
                  <div className="coach-reframes">
                    {entry.reframes.map((reframe) => (
                      <div key={reframe.label} className="coach-reframe-card">
                        <strong>{reframe.label}</strong>
                        <div>{reframe.text}</div>
                        <div className="coach-reframe-note"><strong>Why it works:</strong> {reframe.whyItWorks}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.doctrineHighlights?.length && !entry.evaluation ? (
                <div className="coach-block">
                  <div className="coach-block-title">Why this works</div>
                  <div className="coach-reframes">
                    {entry.doctrineHighlights.map((item) => (
                      <div key={item.title} className="coach-principle-card">
                        <strong>{item.title}</strong>
                        <div>{item.guidance}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.nextStep && !entry.evaluation ? (
                <div className="coach-block">
                  <div className="coach-block-title">What I&apos;d do next</div>
                  <div>{entry.nextStep}</div>
                </div>
              ) : null}
              {entry.suggestions?.length && !entry.evaluation ? (
                <div className="suggestion-list">
                  {entry.suggestions.map((suggestion) => (
                    <button key={suggestion} className="suggestion-chip" onClick={() => setMessage(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {isLoading ? <div className="chat-message chat-assistant">Thinking…</div> : null}
        </div>

        <div className="chat-input-row">
          <div className="coach-composer">
            <textarea
              className="chat-input"
              placeholder="Type your question, or paste a screenshot of your deck or slide..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onPaste={(event) => {
                // Route pasted images/files (e.g. a screenshot) into the same
                // attachment pipeline as the file picker. Plain text paste is
                // left to the default behavior.
                const pasted = event.clipboardData?.files;
                if (pasted && pasted.length > 0) {
                  event.preventDefault();
                  // Some browsers leave pasted screenshots unnamed; give them one.
                  const named = Array.from(pasted).map((file, i) =>
                    file.name ? file : new File([file], `pasted-image-${i + 1}.${file.type.split("/")[1] || "png"}`, { type: file.type })
                  );
                  void handleAttachmentUpload(named);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <div className="coach-upload-row">
              <label className="field coach-upload-field">
                <span>Attach source material</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,.tsv,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                  onChange={(event) => void handleAttachmentUpload(event.target.files)}
                />
              </label>
              {isUploadingAttachments ? <span className="helper-copy">Uploading files…</span> : null}
            </div>
            {pendingAttachments.length ? (
              <div className="coach-attachment-list">
                {pendingAttachments.map((attachment, index) => {
                  const preview = buildAttachmentPreview(attachment);
                  return (
                    <div key={`${attachment.label}-${attachment.filename ?? attachment.kind}-${index}`} className="coach-attachment-card">
                      <strong>{attachment.label}</strong>
                      <span>{attachment.kind.toUpperCase()}{attachment.filename ? ` · ${attachment.filename}` : ""}</span>
                      {attachment.kind === "image" && attachment.url ? (
                        <img
                          className="coach-attachment-thumb"
                          src={attachment.url}
                          alt={attachment.filename ?? attachment.label}
                        />
                      ) : (
                        <p>{preview || "Attached as source material, but no readable text was extracted yet."}</p>
                      )}
                      <div className="action-row">
                        <button className="secondary-button" type="button" onClick={() => removePendingAttachment(index)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="helper-copy">Attach a storyboard, prep document, or deck excerpt and Coach will use it as context for your question.</p>
            )}
          </div>
          <button
            className="primary-button"
            onClick={() => void handleSubmit()}
            disabled={isLoading || isUploadingAttachments || (!message.trim() && pendingAttachments.length === 0)}
          >
            {isLoading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
