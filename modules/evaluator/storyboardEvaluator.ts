import { z } from "zod";
import { processArtifacts } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "./platformEvaluator.js";
import { WRITING_DOCTRINE, VISUAL_DOCTRINE, STYLE_PASS_CHECK } from "../creator/doctrine.js";
import {
  storyboardEvaluatorResponseSchema,
  STORYBOARD_SECTION_DEFINITIONS,
  type StoryboardEvaluatorResponse
} from "../../core/schemas/storyboardEvaluator.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const storyboardEvaluatorRequestSchema = z.object({
  notes: z.string().optional(),
  artifacts: z.array(z.unknown()).optional(),
  title: z.string().optional()
});

const SCORING_RULES = `Score each section 1-5 for QUALITY, then set its status from the score:
- 5 or 4 -> "present" (clearly there and doing its job)
- 3 or 2 -> "weak" (present but underdeveloped, vague, generic, or off-target)
- 1 -> "missing" (genuinely absent from the storyboard)
- only if you truly cannot tell whether it exists -> "unclear"

CRITICAL: "missing" means the section is NOT in the storyboard at all. If a section IS present but poorly executed (a placeholder, a bullet list, a weak draft), it is "weak" (score 2 or 3), never "missing". A storyboard is a draft by nature, so most present-but-rough sections should be "weak", not "missing". Judge the QUALITY of what is actually there, and when it is weak, say what is there and what would make it strong.`;

const NO_EM_DASH = `Do not use em-dashes (the long dash) anywhere in your output. Use commas, colons, periods, or parentheses instead.`;

function buildInstructions(title: string | null, pastedText: string, hasFiles: boolean): string {
  const contentSection = hasFiles
    ? `The attendee's storyboard is attached below (as a document and/or slide images). Read it directly and evaluate what is actually there.${pastedText ? `\n\nAdditional notes from the attendee:\n${pastedText.slice(0, 8000)}` : ""}`
    : `STORYBOARD CONTENT:\n${pastedText.slice(0, 30000)}`;

  return `You are Deckspert's Storyboard Coach, evaluating an attendee's storyboard during a live persuasive storytelling training session. They have moved past prep and drafted the narrative structure of their presentation. They want specific, actionable feedback before building full slides.

Give concrete coaching that references what they actually wrote. This is their material in a paid session.

${NO_EM_DASH}

${WRITING_DOCTRINE}

${VISUAL_DOCTRINE}

EVALUATE these eight story sections. ${SCORING_RULES}

Use these exact keys and labels, in this order:
1. key="openingGambit" label="Opening Gambit": emotional hook that creates tension, not data.
2. key="desiredOutcome" label="Desired Outcome": explicit ask, stated early.
3. key="situationRootCause" label="Situation / Root Cause": real complication plus named root cause, not just context.
4. key="bigIdea" label="Big Idea": a belief the audience must accept; reframes the issue; not a tactic.
5. key="howItWorks" label="How It Works": actions that clearly address the root cause.
6. key="wiifm" label="WIIFM": addresses core, business, and personal needs; not a restatement of the plan.
7. key="close" label="Close": restates the recommendation, reinforces WIIFM, makes an explicit ask.
8. key="actionsNextSteps" label="Actions & Next Steps": owners, timing, commitments.

ALSO assess narrative FLOW and DISCIPLINE across the storyboard as a whole:
- Does the sequence build tension, then reframe, then resolution, or does it sag?
- Is section discipline respected (roughly: Opening Gambit 1, Desired Outcome 1, Root Cause 1, Big Idea 1, How It Works 2 to 4, WIIFM and Close tight)? Flag bloat or missing beats.
- Does each beat earn its place, or are there detours that belong in an appendix?

${STYLE_PASS_CHECK}

overallRead calibration:
- "needs work": 3 or more sections score 1, OR Big Idea, Desired Outcome, and Close are all absent
- "mixed": real strengths with 1 to 2 critical gaps or flow problems
- "strong": no section below 3, key sections (Opening Gambit, Desired Outcome, Big Idea, Close) score 4 or higher, and flow builds cleanly

TASK: Return a single JSON object. No markdown, no code fences:
{
  "evaluatorVersion": "session-storyboard-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentences specific to this storyboard>,
  "sectionFeedback": [ { "key": <key>, "label": <label>, "score": <1-5>, "status": <"present"|"weak"|"missing"|"unclear">, "feedback": <1-3 sentences of specific coaching> } ],
  "flowNotes": [<1-4 observations about sequence, discipline, and pacing>],
  "topFixes": [<2-4 prioritized fixes before building slides>],
  "nextStep": <one sentence on what to do next>
}

${contentSection}`;
}

function fallbackEvaluation(title: string | null): StoryboardEvaluatorResponse {
  return {
    evaluatorVersion: "session-storyboard-v1",
    title,
    overallRead: "needs work",
    executiveSummary:
      "We could not fully read this storyboard. Paste the section-by-section content (or upload the file) and try again.",
    sectionFeedback: STORYBOARD_SECTION_DEFINITIONS.map(([key, label]) => ({
      key,
      label,
      score: 1 as const,
      status: "unclear" as const,
      feedback: `${label} could not be assessed from the provided content.`
    })),
    flowNotes: ["Flow could not be assessed. Add your storyboard content."],
    topFixes: ["Paste your storyboard, section by section, so it can be evaluated."],
    nextStep: "Add your storyboard content and re-run the evaluation."
  };
}

export async function runStoryboardEvaluator(input: unknown): Promise<StoryboardEvaluatorResponse> {
  const payload = storyboardEvaluatorRequestSchema.parse(input);
  const title = payload.title?.trim() || null;
  const pastedText = (payload.notes ?? "").trim();

  const uploaded = createArtifacts(payload.artifacts ?? []);
  const processed = await processArtifacts(uploaded);
  const hasFiles = processed.length > 0;

  if (!pastedText && !hasFiles) {
    throw new Error("Paste your storyboard content (or upload the file) to get feedback.");
  }

  const model = process.env.SESSION_EVALUATOR_MODEL ?? DEFAULT_MODEL;
  const system = `You are Deckspert's Storyboard Coach. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;
  const instructions = buildInstructions(title, pastedText, hasFiles);

  if (hasFiles) {
    const artifactBlocks = await buildUserContent(processed, "");
    const content = [{ type: "text", text: instructions }, ...artifactBlocks];
    return callAnthropicLLMWithContent(content, {
      schema: storyboardEvaluatorResponseSchema,
      model,
      system,
      maxTokens: 4096,
      fallback: () => fallbackEvaluation(title)
    });
  }

  return callAnthropicLLM(instructions, {
    schema: storyboardEvaluatorResponseSchema,
    model,
    system,
    maxTokens: 4096,
    fallback: () => fallbackEvaluation(title)
  });
}
