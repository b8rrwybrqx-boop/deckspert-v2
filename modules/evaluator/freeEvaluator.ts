import { z } from "zod";
import { processArtifacts, flattenArtifactText, listPptxZipEntries } from "../../core/artifacts/extract.js";
import { artifactBatchSchema, type Artifact } from "../../core/schemas/artifact.js";
import {
  freeEvaluatorResponseSchema,
  type FreeEvaluatorResponse
} from "../../core/schemas/freeEvaluator.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Haiku for speed and cost — overridable via FREE_EVALUATOR_MODEL env var
const DEFAULT_MODEL = "claude-haiku-4-5";

// Title slide is intentionally excluded — detected but not scored
const sectionDefinitions = [
  ["openingGambit",      "Opening Gambit"],
  ["desiredOutcome",     "Desired Outcome"],
  ["situationRootCause", "Situation / Root Cause"],
  ["bigIdea",            "Big Idea"],
  ["howItWorks",         "How It Works"],
  ["wiifm",              "WIIFM"],
  ["close",              "Close"],
  ["actionsNextSteps",   "Actions & Next Steps"]
] as const;

const freeEvaluatorRequestSchema = z.object({
  artifacts: artifactBatchSchema.min(1).max(1),
  notes: z.string().optional()
});

type FreeEvaluatorRequest = z.infer<typeof freeEvaluatorRequestSchema>;

// ── Embedded media detection ──────────────────────────────────────────────────

const VIDEO_EXTENSIONS = [".mp4", ".wmv", ".avi", ".mov", ".m4v", ".webm"];
const EXCEL_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];

async function detectEmbeddedMedia(artifact: Artifact): Promise<{ hasVideo: boolean; hasExcel: boolean }> {
  if (artifact.kind !== "pptx") {
    return { hasVideo: false, hasExcel: false };
  }
  try {
    const entries = await listPptxZipEntries(artifact);
    const mediaEntries = entries.filter((e) => e.startsWith("ppt/media/") || e.startsWith("ppt/embeddings/"));
    const hasVideo = mediaEntries.some((e) => VIDEO_EXTENSIONS.some((ext) => e.toLowerCase().endsWith(ext)));
    const hasExcel = mediaEntries.some((e) => EXCEL_EXTENSIONS.some((ext) => e.toLowerCase().endsWith(ext)));
    return { hasVideo, hasExcel };
  } catch {
    // If we can't inspect the ZIP, proceed — extraction will surface issues
    return { hasVideo: false, hasExcel: false };
  }
}

// ── Scoring rubric ────────────────────────────────────────────────────────────

const SECTION_SCORING_GUIDE = `
CRITICAL CLASSIFICATION RULES — apply before scoring:

1. Opening Gambit ≠ Situation data. Statistical slides, research findings, trend data, and consumer insight slides are Situation content, NOT an Opening Gambit. An Opening Gambit must be an emotional hook: a provocative question, sharp contrast, compelling quote, or tension-creating statement that precedes or frames the data. If the first substantive slide is data/statistics, Opening Gambit is absent — score 1.

2. Big Idea requires a standalone declarative belief sentence. A Venn diagram, visual label, tagline, or section heading does NOT qualify. If no explicit "we must believe X" or "to achieve Y, you must Z" statement exists as a distinct narrative beat, Big Idea is absent — score 1.

3. Desired Outcome requires an explicit ask. An implied purpose or general category does not qualify. If the deck never states what the audience is being asked to decide, approve, or do, Desired Outcome is absent — score 1.

4. Close requires a recommendation restatement + ask. A contact/brand slide is NOT a Close. If the deck ends without restating the recommendation and making an explicit ask, Close is absent — score 1.

5. Actions & Next Steps requires named owners, timing, or defined commitments. Contact information alone is not Actions & Next Steps — score 1 if absent.

6. Be conservative. When a section is implied but not explicit, score one level lower than it seems. It is better to under-score a weak section than over-score it — the paid evaluator will surface nuance.

Score each section 1–5:

Opening Gambit: 1=no hook or hook is actually Situation data  2=weak/generic hook  3=relevant hook but unlinked to outcome  4=strong/urgency-creating hook  5=compelling hook tied to Desired Outcome
Desired Outcome: 1=missing or never explicit  2=only at end/weak  3=early but vague  4=early/clear/specific  5=highly relevant and reinforced
Situation/Root Cause: 1=unclear/disconnected  2=descriptive but irrelevant  3=clear situation but no root cause  4=root cause implied  5=explicit compelling root cause
Big Idea: 1=missing or only a label/visual  2=present but not a belief statement  3=follows situation but weak bridge  4=clear standalone belief statement  5=simple motivating declarative belief
How It Works: 1=no actions  2=vague/disconnected catalog  3=clear but weak root-cause linkage  4=relevant actions addressing root cause  5=persuasive structured plan
WIIFM: 1=no benefits  2=generic benefits not tied to this audience  3=clear but not tailored  4=strong audience-centered benefits  5=highly compelling tied to audience priorities
Close: 1=no close/ask or contact slide only  2=generic thank-you  3=ask present but vague  4=strong aligned ask  5=persuasive complete close with ask+WIIFM+timing
Actions & Next Steps: 1=missing or contact info only  2=implied/no ownership  3=defined but no owners/timing  4=clear owners/partial timing  5=fully defined with owner+timing+accountability

Status rules (derived from score):
- score 5 or 4 → "present"
- score 3 → "weak"
- score 2 → "missing"
- score 1 → "missing"

overallRead calibration:
- "needs work" → 3 or more sections score 1, OR Big Idea + Desired Outcome + Close all absent
- "mixed" → 1–2 sections score 1 and some structural strengths present
- "strong" → no section scores below 3 and key sections (Opening Gambit, Desired Outcome, Big Idea, Close) score 4+
`;

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(deckName: string | null, text: string): string {
  return `You are Deckspert Free Evaluator — a diagnostic-only presentation story-structure tool calibrated to match the rigor of the paid Deckspert Professional evaluator.

RULES:
- Assess only what appears in the extracted slide text.
- Do NOT rewrite content, suggest improvements, or reference specific deck details.
- Feedback must be GENERIC and structural — describe what is present, weak, or missing in terms of story function only. Do not quote titles, names, data, or context from the slides.
- Do not provide slide-by-slide analysis.
- Apply the CRITICAL CLASSIFICATION RULES strictly. When uncertain whether a section is present, score it absent (1) rather than present. The paid evaluator is stricter — match its threshold.
- A section is only "present" if it performs its explicit story function as a distinct element. Implied sections, partial content, or adjacent slides that gesture at a function do not qualify as present.
- TITLE SLIDE: If a title slide is present, note it in slideCount but DO NOT score it and DO NOT include it in sectionFeedback. It is not a persuasive storytelling element.

INPUT FORMAT NOTES (for PPTX files):
- Each slide block is labelled "=== SLIDE N ===" with structured sub-fields.
- TITLE: is the slide title placeholder.
- BODY: lists bullet text with indent level (• = top level, · = sub-level).
- OTHER: text from non-placeholder shapes (callouts, labels, annotations).
- BUILDS: describes click-reveal animation sequences — "progressive bullet build" means the presenter intended to reveal bullets one at a time, suggesting intentional narrative pacing per slide.
- NOTES: speaker notes — the presenter's intended spoken narrative. This is high-signal content: use it to assess story intent when slide text alone is sparse.
- EXCLUDED slide counts are reported at the end — hidden slides, appendix sections, and post-closing slides are filtered before you receive the text. Do not speculate about excluded content.
- PRESENTATION METADATA (if present) gives editing time, revision count, and notes coverage — context only, not scored.

${SECTION_SCORING_GUIDE}

TASK: Evaluate the deck and return a single JSON object — no markdown, no code fences, just the raw JSON.

JSON structure:
{
  "evaluatorVersion": "free-v1",
  "deckName": ${deckName ? `"${deckName.replace(/"/g, "'")}"` : "null"},
  "slideCount": <integer or null — include all slides, including any title slide>,
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <100-150 word structural overview — no content-specific references>,
  "sectionFeedback": [
    {
      "key": <one of the eight keys below>,
      "label": <section label>,
      "score": <integer 1-5>,
      "status": <"present" | "weak" | "missing" | "unclear">,
      "feedback": <1-2 sentences — structural observation only, no deck-specific references>,
      "evidence": null
    }
  ],
  "overallInsights": [<3-5 generic structural observations>],
  "professionalTeaser": "For even more robust insight on your story, try Deckspert Professional."
}

Required sectionFeedback keys in this order (8 sections, no title slide):
${sectionDefinitions.map(([key, label], i) => `${i + 1}. key="${key}" label="${label}"`).join("\n")}

EXTRACTED DECK TEXT:
${text.slice(0, 30000)}`;
}

// ── Fallback (no API key or parse failure) ────────────────────────────────────

function fallbackSection(key: string, label: string): FreeEvaluatorResponse["sectionFeedback"][number] {
  return {
    key: key as FreeEvaluatorResponse["sectionFeedback"][number]["key"],
    label,
    score: 1,
    status: "unclear",
    feedback: `${label} could not be assessed — please ensure the uploaded file contains readable slide text.`,
    evidence: null
  };
}

function fallbackEvaluation(deckName: string | null): FreeEvaluatorResponse {
  return {
    evaluatorVersion: "free-v1",
    deckName,
    slideCount: null,
    overallRead: "needs work",
    executiveSummary:
      "The free evaluator was unable to fully assess this presentation. Please ensure the file contains readable slide text and try again.",
    sectionFeedback: sectionDefinitions.map(([key, label]) => fallbackSection(key, label)),
    overallInsights: [
      "Upload a PDF or PPTX with visible slide text for the most accurate story-structure read.",
      "The free evaluator checks whether the eight core persuasive story sections are identifiable in the deck.",
      "Missing or weak sections typically reduce story clarity even when individual slides contain useful content."
    ],
    professionalTeaser:
      "For even more robust insight on your story, try Deckspert Professional."
  };
}

// ── Anthropic call ────────────────────────────────────────────────────────────

async function callAnthropic(prompt: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const model = process.env.FREE_EVALUATOR_MODEL ?? DEFAULT_MODEL;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: "You are Deckspert Free Evaluator. Return only valid JSON — no markdown, no code fences.",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const raw = json.content.find(b => b.type === "text")?.text ?? "";

  if (!raw.trim()) {
    throw new Error("Free evaluator returned an empty response");
  }

  // Strip markdown code fences if the model wrapped in them
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    throw new Error(`Free evaluator response was not valid JSON: ${stripped.slice(0, 200)}`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runFreeEvaluator(input: unknown): Promise<FreeEvaluatorResponse> {
  const payload: FreeEvaluatorRequest = freeEvaluatorRequestSchema.parse(input);
  const artifacts = payload.artifacts as Artifact[];
  const [artifact] = artifacts;
  const deckName = artifact.filename ?? artifact.label ?? null;

  // E4 — Embedded media check (before extraction to avoid unnecessary processing)
  const { hasVideo, hasExcel } = await detectEmbeddedMedia(artifact);
  if (hasVideo) {
    throw new Error(
      "This deck contains embedded video, which isn't supported by the free evaluator. Remove the video and re-upload, or export the deck as a PDF."
    );
  }
  if (hasExcel) {
    throw new Error(
      "This deck contains an embedded Excel object. Please remove it or export as PDF before evaluating."
    );
  }

  const processed = await processArtifacts(artifacts);
  const text = flattenArtifactText(processed);

  if (!text.trim()) {
    throw new Error(
      "No readable text could be extracted from this file. Make sure your slides contain text content and try again, or export as PDF."
    );
  }

  try {
    const raw = await callAnthropic(buildPrompt(deckName, text));
    return freeEvaluatorResponseSchema.parse(raw);
  } catch (error) {
    console.warn("[Deckspert][FreeEvaluator] falling back to heuristic", {
      error: error instanceof Error ? error.message : String(error)
    });
    return freeEvaluatorResponseSchema.parse(fallbackEvaluation(deckName));
  }
}
