import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { artifactBatchSchema, type Artifact } from "../../core/schemas/artifact.js";
import {
  freeEvaluatorResponseSchema,
  type FreeEvaluatorResponse
} from "../../core/schemas/freeEvaluator.js";
import { callLLM } from "../../core/llm/client.js";

const sectionDefinitions = [
  ["titleSlide", "Title Slide"],
  ["openingGambit", "Opening Gambit"],
  ["desiredOutcome", "Desired Outcome"],
  ["situationRootCause", "Situation / Root Cause"],
  ["bigIdea", "Big Idea"],
  ["howItWorks", "How It Works"],
  ["wiifm", "WIIFM"],
  ["close", "Close"],
  ["actionsNextSteps", "Actions & Next Steps"]
] as const;

const freeEvaluatorRequestSchema = z.object({
  artifacts: artifactBatchSchema.min(1).max(1),
  notes: z.string().optional()
});

type FreeEvaluatorRequest = z.infer<typeof freeEvaluatorRequestSchema>;

function countSlides(text: string): number | null {
  const matches = Array.from(text.matchAll(/\bSlide\s+(\d+)\s*:/gi)).map((match) => Number(match[1]));
  const highest = Math.max(0, ...matches.filter(Number.isFinite));
  return highest || null;
}

function findEvidence(text: string, patterns: RegExp[]) {
  const slides = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const match = slides.find((slide) => patterns.some((pattern) => pattern.test(slide)));
  return match ? match.replace(/\s+/g, " ").slice(0, 180) : null;
}

function heuristicStatus(evidence: string | null): "present" | "weak" | "missing" | "unclear" {
  return evidence ? "weak" : "missing";
}

function fallbackEvaluation(deckName: string | null, text: string): FreeEvaluatorResponse {
  const slideCount = countSlides(text);
  const sectionPatterns: Record<(typeof sectionDefinitions)[number][0], RegExp[]> = {
    titleSlide: [/Slide\s+1/i],
    openingGambit: [/opening|why now|imagine|what if|challenge|opportunity/i],
    desiredOutcome: [/desired outcome|objective|goal|decision|approve|alignment|ask/i],
    situationRootCause: [/situation|root cause|challenge|trend|decline|growth|barrier|driver|because|why/i],
    bigIdea: [/big idea|belief|must|need to|the answer|strategy/i],
    howItWorks: [/how it works|approach|plan|pillar|step|roadmap|solution|program/i],
    wiifm: [/wiifm|benefit|value|impact|growth|savings|margin|revenue|customer/i],
    close: [/close|summary|recommendation|ask|approve|decision/i],
    actionsNextSteps: [/next step|action|owner|timeline|by when|follow up|pilot|launch/i]
  };

  const sectionFeedback = sectionDefinitions.map(([key, label]) => {
    const evidence = findEvidence(text, sectionPatterns[key]);
    return {
      key,
      label,
      status: heuristicStatus(evidence),
      evidence,
      feedback: evidence
        ? `${label} appears to have some supporting material, but the free read cannot confirm strength without a deeper paid evaluation.`
        : `${label} was not clearly identifiable from the uploaded presentation text.`
    };
  });

  const presentCount = sectionFeedback.filter((section) => section.status !== "missing").length;
  const overallRead = presentCount >= 7 ? "mixed" : "needs work";

  return {
    evaluatorVersion: "free-v1",
    deckName,
    slideCount,
    overallRead,
    executiveSummary:
      "This free read reviewed the uploaded presentation for core story structure. The deck appears to include some recognizable story elements, but several sections may need clearer placement or stronger signaling. Use the section feedback below to see which parts of the story are easiest to identify and where the overall flow may feel incomplete.",
    sectionFeedback,
    overallInsights: [
      "The free evaluator focuses on whether the expected story sections are visible in the deck.",
      "Sections marked weak or missing may reduce story clarity even when individual slides contain useful content.",
      "A stronger story usually makes the audience need, core idea, benefits, and ask easy to find."
    ],
    professionalTeaser:
      "For even more robust insight on your story, try Deckspert Professional for deeper evaluation, StoryLab, Coach, and Dynamic Delivery."
  };
}

function buildPrompt(deckName: string | null, text: string, notes?: string) {
  return [
    "Evaluate this uploaded presentation using the free Deckspert Evaluator scope.",
    "",
    "Rules:",
    "- Diagnostic only. Assess only what appears in the uploaded deck text.",
    "- Do not rewrite content.",
    "- Do not generate missing story elements.",
    "- Do not provide context-specific improvement recommendations.",
    "- Do not provide slide-by-slide compelling-content review.",
    "- Do not score sections numerically.",
    "- Return exactly nine sectionFeedback entries in the requested order.",
    "",
    "Required section order:",
    sectionDefinitions.map(([, label], index) => `${index + 1}. ${label}`).join("\n"),
    "",
    "Output JSON shape:",
    `{
  "evaluatorVersion": "free-v1",
  "deckName": string | null,
  "slideCount": number | null,
  "overallRead": "strong" | "mixed" | "needs work",
  "executiveSummary": string,
  "sectionFeedback": [{"key": string, "label": string, "status": "present" | "weak" | "missing" | "unclear", "feedback": string, "evidence": string | null}],
  "overallInsights": string[],
  "professionalTeaser": string
}`,
    "",
    "Professional teaser must say: For even more robust insight on your story, try Deckspert Professional.",
    "",
    `Deck name: ${deckName ?? "Unknown"}`,
    notes?.trim() ? `User notes: ${notes.trim()}` : "",
    "",
    "Extracted deck text:",
    text.slice(0, 30000)
  ].filter(Boolean).join("\n");
}

export async function runFreeEvaluator(input: unknown): Promise<FreeEvaluatorResponse> {
  const payload: FreeEvaluatorRequest = freeEvaluatorRequestSchema.parse(input);
  const artifacts = payload.artifacts as Artifact[];
  const [artifact] = artifacts;
  const processed = await processArtifacts(artifacts);
  const text = flattenArtifactText(processed);
  const deckName = artifact.filename ?? artifact.label ?? null;

  if (!text.trim()) {
    throw new Error("We could not extract readable text from that file. Please upload a PDF or PPTX with visible slide text.");
  }

  try {
    return await callLLM(buildPrompt(deckName, text, payload.notes), {
      schema: freeEvaluatorResponseSchema,
      temperature: 0.2,
      system: "You are Deckspert Free Evaluator, a diagnostic-only presentation story-structure evaluator.",
      fallback: () => fallbackEvaluation(deckName, text)
    });
  } catch (error) {
    console.warn("[Deckspert][FreeEvaluator] using heuristic fallback", {
      error: error instanceof Error ? error.message : String(error)
    });
    return freeEvaluatorResponseSchema.parse(fallbackEvaluation(deckName, text));
  }
}
