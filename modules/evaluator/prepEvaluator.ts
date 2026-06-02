import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import { WRITING_DOCTRINE, STYLE_PASS_CHECK } from "../creator/doctrine.js";
import {
  prepEvaluatorResponseSchema,
  PREP_SECTION_DEFINITIONS,
  type PrepEvaluatorResponse
} from "../../core/schemas/prepEvaluator.js";

// Quality over cost for live-session tools — Sonnet 4.6 by default, overridable.
const DEFAULT_MODEL = "claude-sonnet-4-6";

const prepEvaluatorRequestSchema = z.object({
  notes: z.string().optional(),
  artifacts: z.array(z.unknown()).optional(),
  title: z.string().optional()
});

function buildPrompt(title: string | null, text: string): string {
  return `You are Deckspert's Proper Prep Coach, evaluating a Proper Preparation worksheet during a live persuasive storytelling training session. The attendee has shared their own prep work and wants specific, actionable feedback before they build a storyboard.

Unlike a generic evaluator, you SHOULD reference what the attendee actually wrote and give concrete, usable coaching — this is their material in a paid session, not an anonymous sample.

${WRITING_DOCTRINE}

EVALUATE these prep elements. Score each 1–5 and assign a status:
- score 5 or 4 → "present"
- score 3 → "weak"
- score 2 → "missing"
- score 1 → "missing"
- if the element genuinely cannot be assessed from the text → "unclear" (score 1)

Elements (use these exact keys and labels, in this order):
1. key="audience" label="Audience & Behavioral Style" — Is the decision-maker identified with role/level AND behavioral style (thinker/director/relater/socializer)? Are their core, business, and personal needs distinct?
2. key="desiredOutcome" label="Desired Outcome" — Is there a single, explicit ask: what the audience must decide, approve, or do? Vague aspirations score low.
3. key="reasonsYesNo" label="Reasons to Say Yes / No" — Are the real reasons the audience would say yes AND the objections/reasons to say no both surfaced honestly?
4. key="situationComplication" label="Situation & Complication" — Is there genuine tension (a complication), not just neutral context? A situation with no complication does not move anyone.
5. key="rootCause" label="Root Cause" — Does it name the underlying root cause, not just symptoms?
6. key="bigIdea" label="Big Idea" — Is the Big Idea a single BELIEF the audience must accept (it reframes the issue), NOT a tactic, KPI, or list of actions? Self-test: would the audience have to agree with it before saying yes?
7. key="openingGambit" label="Opening Gambit" — Is there an emotional hook (provocative question, sharp contrast, compelling quote, tension-creating statement)? Data/statistics alone are NOT an opening gambit.
8. key="wiifm" label="WIIFM" — Does it address all three need layers (core, business, personal) and is it distinct from a restatement of the plan?
9. key="proofPoints" label="Proof Points" — Are there credible proof points, and is data shown in comparison context (vs. prior period, competitor, benchmark) rather than as isolated numbers?

${STYLE_PASS_CHECK}

overallRead calibration:
- "needs work" → 3+ elements score 1, OR Big Idea + Desired Outcome both absent
- "mixed" → some real strengths but 1–2 critical gaps
- "strong" → no element below 3 and Audience, Desired Outcome, Big Idea all score 4+

TASK: Return a single JSON object — no markdown, no code fences:
{
  "evaluatorVersion": "session-prep-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentence read of the prep as a whole — specific to what they wrote>,
  "sectionFeedback": [
    { "key": <key>, "label": <label>, "score": <1-5>, "status": <"present"|"weak"|"missing"|"unclear">, "feedback": <1-3 sentences of specific, actionable coaching referencing their content> }
  ],
  "topFixes": [<2-4 prioritized, concrete fixes to make before building the storyboard>],
  "nextStep": <one sentence telling them what to do next>
}

PROPER PREP WORKSHEET CONTENT:
${text.slice(0, 30000)}`;
}

function fallbackEvaluation(title: string | null): PrepEvaluatorResponse {
  return {
    evaluatorVersion: "session-prep-v1",
    title,
    overallRead: "needs work",
    executiveSummary:
      "We couldn't fully read this prep. Paste the worksheet content (or upload the file) and try again so we can give you specific feedback.",
    sectionFeedback: PREP_SECTION_DEFINITIONS.map(([key, label]) => ({
      key,
      label,
      score: 1 as const,
      status: "unclear" as const,
      feedback: `${label} could not be assessed from the provided content.`
    })),
    topFixes: ["Paste your Proper Prep worksheet content so each element can be evaluated."],
    nextStep: "Add your worksheet content and re-run the evaluation."
  };
}

export async function runPrepEvaluator(input: unknown): Promise<PrepEvaluatorResponse> {
  const payload = prepEvaluatorRequestSchema.parse(input);
  const title = payload.title?.trim() || null;

  const uploaded = createArtifacts(payload.artifacts ?? []);
  const processed = await processArtifacts(uploaded);
  const text = [payload.notes ?? "", flattenArtifactText(processed)].filter(Boolean).join("\n\n").trim();

  if (!text) {
    throw new Error("Paste your Proper Prep worksheet content (or upload the file) to get feedback.");
  }

  return callAnthropicLLM(buildPrompt(title, text), {
    schema: prepEvaluatorResponseSchema,
    model: process.env.SESSION_EVALUATOR_MODEL ?? DEFAULT_MODEL,
    system: "You are Deckspert's Proper Prep Coach. Return only valid JSON — no markdown, no code fences.",
    maxTokens: 4096,
    fallback: () => fallbackEvaluation(title)
  });
}
