import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "./platformEvaluator.js";
import { WRITING_DOCTRINE, STYLE_PASS_CHECK, HUMAN_VOICE_PROTOCOL } from "../creator/doctrine.js";
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

  return `You are Deckspert's Proper Prep Coach, evaluating a TPG Proper Preparation Planning Worksheet during a live persuasive storytelling training session. The attendee has shared their own prep work and wants specific, actionable feedback before they build a storyboard.

You SHOULD reference what the attendee actually wrote and give concrete, usable coaching. This is their material in a paid session, not an anonymous sample.

SCOPE: This is the PRE-WORK planning worksheet, not a storyboard or finished presentation. Evaluate ONLY the worksheet fields listed below. Do NOT look for or penalize the absence of storyboard or slide elements such as Situation, Root Cause, Big Idea, Opening Gambit, WIIFM, How It Works, Close, or Proof Points. Those come later in the method and are evaluated by a separate tool. If you mention them at all, mention them only as "what comes next," never as a gap in this worksheet.

${HUMAN_VOICE_PROTOCOL}

${WRITING_DOCTRINE}

EVALUATE these worksheet fields. ${SCORING_RULES}

Fields (use these exact keys and labels, in this order):
1. key="audience" label="Audience": Is the target audience or account clearly and specifically identified (who they are, what segment or business), not generic?
2. key="behavioralStyle" label="Behavioral Style & Position": Is a behavioral style identified (Thinker, Director, Socializer, or Relater) and the position or role filled in? This is a checkbox selection, so judge it as PRESENT vs NOT PRESENT only, NOT on a 1-5 quality scale. Set "score" to null. Set "status" to "present" if a style is selected and a position is given, otherwise "missing". In the feedback, name the selected style and one sentence on what it implies for tailoring (Thinkers want logic and detail, Directors want bottom-line and options, Socializers want vision and energy, Relaters want trust and low risk).
3. key="coreNeeds" label="Core Needs": Are the core, department, or category needs specific and real (the functional things this audience must solve), not vague? Each need should connect to the Desired Outcome.
4. key="businessNeeds" label="Business Needs": Are the audience's business needs (commercial pressures, growth, risk, cost) specific and relevant?
5. key="personalNeeds" label="Personal Needs": Are the decision-maker's personal needs identified (what they personally gain, fear, or are measured on), not just business needs restated?
6. key="desiredOutcome" label="Desired Outcome": Is there a clear, specific outcome, meaning what the attendee wants the audience to decide, approve, or do? Vague aspirations score low.
7. key="reasonsToSayYes" label="Reasons to Say Yes": Are the reasons compelling and tied to the stated needs (each reason should map to a real need), not generic selling points?
8. key="reasonsToSayNo" label="Reasons to Say No": Are the real objections and reasons to say no surfaced honestly, so they can be pre-empted? Honest, specific objections score high; a blank or token list scores low.

Also consider alignment: the worksheet asks whether each need is addressed by the Desired Outcome. Reward prep where the needs, Desired Outcome, and Reasons to Say Yes clearly line up, and flag where they do not.

${STYLE_PASS_CHECK}

overallRead calibration:
- "needs work": 3 or more fields score 1, OR Audience and Desired Outcome are both weak or absent
- "mixed": some real strengths but 1 to 2 critical gaps
- "strong": no field below 3, and Audience, the three Needs layers, and Desired Outcome are all specific and aligned

TASK: Return a single JSON object. No markdown, no code fences:
{
  "evaluatorVersion": "session-prep-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentence read of the prep as a whole, specific to what they wrote>,
  "sectionFeedback": [
    { "key": <key>, "label": <label>, "score": <1-5, or null for behavioralStyle>, "status": <"present"|"weak"|"missing"|"unclear">, "feedback": <1-3 sentences of specific, actionable coaching referencing their content> }
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
      score: key === "behavioralStyle" ? null : (1 as const),
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
