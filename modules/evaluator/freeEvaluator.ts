import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { artifactBatchSchema, type Artifact } from "../../core/schemas/artifact.js";
import {
  freeEvaluatorResponseSchema,
  type FreeEvaluatorResponse
} from "../../core/schemas/freeEvaluator.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Haiku for speed and cost — overridable via FREE_EVALUATOR_MODEL env var
const DEFAULT_MODEL = "claude-haiku-4-5";

const sectionDefinitions = [
  ["titleSlide",        "Title Slide"],
  ["openingGambit",     "Opening Gambit"],
  ["desiredOutcome",    "Desired Outcome"],
  ["situationRootCause","Situation / Root Cause"],
  ["bigIdea",          "Big Idea"],
  ["howItWorks",       "How It Works"],
  ["wiifm",            "WIIFM"],
  ["close",            "Close"],
  ["actionsNextSteps", "Actions & Next Steps"]
] as const;

const freeEvaluatorRequestSchema = z.object({
  artifacts: artifactBatchSchema.min(1).max(1),
  notes: z.string().optional()
});

type FreeEvaluatorRequest = z.infer<typeof freeEvaluatorRequestSchema>;

// ── Scoring rubric (same 1–5 scale as v4.5, condensed) ───────────────────────

const SECTION_SCORING_GUIDE = `
Score each section 1–5 using these definitions:

Title Slide: 1=missing/image-only  2=logo-only/no orientation  3=states WHAT only  4=WHO+WHAT present  5=clear WHO+WHAT+WHY
Opening Gambit: 1=no hook  2=weak/generic  3=relevant but unlinked  4=strong/urgency-creating  5=compelling and tied to Desired Outcome
Desired Outcome: 1=missing  2=only at end/weak  3=early but vague  4=early/clear/specific  5=highly relevant and reinforced
Situation/Root Cause: 1=unclear/disconnected  2=descriptive but irrelevant  3=clear situation but no root cause  4=root cause implied  5=explicit compelling root cause
Big Idea: 1=missing  2=present but illogical  3=follows situation but weak bridge  4=clear belief statement  5=simple motivating standalone belief
How It Works: 1=no actions  2=vague/disconnected  3=clear but weak root-cause linkage  4=relevant actions addressing root cause  5=persuasive structured plan
WIIFM: 1=no benefits  2=vague/generic  3=clear but not tailored  4=strong audience-centered benefits  5=highly compelling tied to audience priorities
Close: 1=no close/ask  2=generic thank-you  3=ask present but vague  4=strong aligned ask  5=persuasive complete close with ask+WIIFM+timing
Actions & Next Steps: 1=missing/vague  2=implied/no ownership  3=defined but no owners/timing  4=clear owners/partial timing  5=fully defined with owner+timing+accountability

Status rules (derived from score):
- score 5 or 4 → "present"
- score 3 → "weak"
- score 2 → "weak"
- score 1 → "missing"
`;

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(deckName: string | null, text: string): string {
  return `You are Deckspert Free Evaluator — a diagnostic-only presentation story-structure tool.

RULES:
- Assess only what appears in the extracted slide text.
- Do NOT rewrite content, suggest improvements, or reference specific deck details.
- Feedback must be GENERIC and structural — describe what is present, weak, or missing in terms of story function only. Do not quote titles, names, data, or context from the slides.
- Do not provide slide-by-slide analysis.

${SECTION_SCORING_GUIDE}

TASK: Evaluate the deck and return a single JSON object — no markdown, no code fences, just the raw JSON.

JSON structure:
{
  "evaluatorVersion": "free-v1",
  "deckName": ${deckName ? `"${deckName.replace(/"/g, "'")}"` : "null"},
  "slideCount": <integer or null>,
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <100-150 word structural overview — no content-specific references>,
  "sectionFeedback": [
    {
      "key": <one of the nine keys below>,
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

Required sectionFeedback keys in this order:
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
      "The free evaluator checks whether the nine core story sections are identifiable in the deck.",
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
  const processed = await processArtifacts(artifacts);
  const text = flattenArtifactText(processed);
  const deckName = artifact.filename ?? artifact.label ?? null;

  if (!text.trim()) {
    throw new Error(
      "We could not extract readable text from that file. Please upload a PDF or PPTX with visible slide text."
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
