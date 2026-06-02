import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "./platformEvaluator.js";
import { WRITING_DOCTRINE, STYLE_PASS_CHECK } from "../creator/doctrine.js";
import {
  prepEvaluatorResponseSchema,
  PREP_SECTION_DEFINITIONS,
  type PrepEvaluatorResponse
} from "../../core/schemas/prepEvaluator.js";

// Quality over cost for live-session tools. Sonnet 4.6 by default, overridable.
const DEFAULT_MODEL = "claude-sonnet-4-6";

const prepEvaluatorRequestSchema = z.object({
  notes: z.string().optional(),
  artifacts: z.array(z.unknown()).optional(),
  title: z.string().optional()
});

// Shared status/quality calibration so "missing" never gets applied to content
// that is present-but-weak. Used verbatim across the session evaluators.
const SCORING_RULES = `Score each element 1-5 for QUALITY, then set its status from the score:
- 5 or 4 -> "present" (clearly there and doing its job)
- 3 or 2 -> "weak" (present but underdeveloped, vague, generic, or off-target)
- 1 -> "missing" (genuinely absent from the submission)
- only if you truly cannot tell whether it exists -> "unclear"

CRITICAL: "missing" means the element is NOT in the submission at all. If the element IS present but poorly executed, it is "weak" (score 2 or 3), never "missing". Judge the QUALITY of what is actually there, not merely whether a label or heading exists. When something is present but weak, say what is there and what would make it strong.`;

const NO_EM_DASH = `Do not use em-dashes (the long dash) anywhere in your output. Use commas, colons, periods, or parentheses instead.`;

function buildInstructions(title: string | null, pastedText: string, hasFiles: boolean): string {
  const contentSection = hasFiles
    ? `The attendee's Proper Prep worksheet is attached below (as a document and/or slide images). Read it directly and evaluate what is actually there.${pastedText ? `\n\nAdditional notes from the attendee:\n${pastedText.slice(0, 8000)}` : ""}`
    : `PROPER PREP WORKSHEET CONTENT:\n${pastedText.slice(0, 30000)}`;

  return `You are Deckspert's Proper Prep Coach, evaluating a Proper Preparation worksheet during a live persuasive storytelling training session. The attendee has shared their own prep work and wants specific, actionable feedback before they build a storyboard.

You SHOULD reference what the attendee actually wrote and give concrete, usable coaching. This is their material in a paid session, not an anonymous sample.

This is a PLANNING worksheet, not a finished presentation. Evaluate the quality of the planning inputs. Do not penalize the attendee for not having polished slide content, only for prep inputs that are missing, vague, or off-target.

${NO_EM_DASH}

${WRITING_DOCTRINE}

EVALUATE these prep elements. ${SCORING_RULES}

Elements (use these exact keys and labels, in this order):
1. key="audience" label="Audience & Behavioral Style": Is the decision-maker identified with role/level AND behavioral style (thinker/director/relater/socializer)? Are their core, business, and personal needs distinct?
2. key="desiredOutcome" label="Desired Outcome": Is there a single, explicit ask, meaning what the audience must decide, approve, or do? Vague aspirations score low.
3. key="reasonsYesNo" label="Reasons to Say Yes / No": Are the real reasons the audience would say yes AND the objections or reasons to say no both surfaced honestly?
4. key="situationComplication" label="Situation & Complication": Is there genuine tension (a complication), not just neutral context? A situation with no complication does not move anyone.
5. key="rootCause" label="Root Cause": Does it name the underlying root cause, not just symptoms?
6. key="bigIdea" label="Big Idea": Is the Big Idea a single BELIEF the audience must accept (it reframes the issue), NOT a tactic, KPI, or list of actions? Self-test: would the audience have to agree with it before saying yes?
7. key="openingGambit" label="Opening Gambit": Is there an emotional hook (provocative question, sharp contrast, compelling quote, tension-creating statement)? Data or statistics alone are NOT an opening gambit.
8. key="wiifm" label="WIIFM": Does it address all three need layers (core, business, personal) and is it distinct from a restatement of the plan?
9. key="proofPoints" label="Proof Points": Are there credible proof points, and is data shown in comparison context (vs. prior period, competitor, benchmark) rather than as isolated numbers?

${STYLE_PASS_CHECK}

overallRead calibration:
- "needs work": 3 or more elements score 1, OR Big Idea and Desired Outcome are both absent
- "mixed": some real strengths but 1 to 2 critical gaps
- "strong": no element below 3 and Audience, Desired Outcome, Big Idea all score 4 or higher

TASK: Return a single JSON object. No markdown, no code fences:
{
  "evaluatorVersion": "session-prep-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentence read of the prep as a whole, specific to what they wrote>,
  "sectionFeedback": [
    { "key": <key>, "label": <label>, "score": <1-5>, "status": <"present"|"weak"|"missing"|"unclear">, "feedback": <1-3 sentences of specific, actionable coaching referencing their content> }
  ],
  "topFixes": [<2-4 prioritized, concrete fixes to make before building the storyboard>],
  "nextStep": <one sentence telling them what to do next>
}

${contentSection}`;
}

function fallbackEvaluation(title: string | null): PrepEvaluatorResponse {
  return {
    evaluatorVersion: "session-prep-v1",
    title,
    overallRead: "needs work",
    executiveSummary:
      "We could not fully read this prep. Paste the worksheet content (or upload the file) and try again so we can give you specific feedback.",
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
  const pastedText = (payload.notes ?? "").trim();

  const uploaded = createArtifacts(payload.artifacts ?? []);
  const processed = await processArtifacts(uploaded);
  const hasFiles = processed.length > 0;

  if (!pastedText && !hasFiles) {
    throw new Error("Paste your Proper Prep worksheet content (or upload the file) to get feedback.");
  }

  const model = process.env.SESSION_EVALUATOR_MODEL ?? DEFAULT_MODEL;
  const system = `You are Deckspert's Proper Prep Coach. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;
  const instructions = buildInstructions(title, pastedText, hasFiles);

  // With an uploaded file, send rich multimodal content (PDF document / PPTX
  // slide images) so the model reads what is actually on the page, the same way
  // the platform evaluator does. Pasted-text only uses the plain text path.
  if (hasFiles) {
    const artifactBlocks = await buildUserContent(processed, "");
    const content = [{ type: "text", text: instructions }, ...artifactBlocks];
    return callAnthropicLLMWithContent(content, {
      schema: prepEvaluatorResponseSchema,
      model,
      system,
      maxTokens: 4096,
      fallback: () => fallbackEvaluation(title)
    });
  }

  return callAnthropicLLM(instructions, {
    schema: prepEvaluatorResponseSchema,
    model,
    system,
    maxTokens: 4096,
    fallback: () => fallbackEvaluation(title)
  });
}
