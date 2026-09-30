import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "./platformEvaluator.js";
import { WRITING_DOCTRINE, STYLE_PASS_CHECK, HUMAN_VOICE_PROTOCOL } from "../creator/doctrine.js";
import {
  makePrepResponseSchema,
  type PrepEvaluatorResponse
} from "../../core/schemas/prepEvaluator.js";
import { TPG_DEFAULT, type ProgramProfile } from "../../core/programs/index.js";

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

export function buildInstructions(
  title: string | null,
  pastedText: string,
  hasFiles: boolean,
  profile: ProgramProfile = TPG_DEFAULT
): string {
  const { sections, scopeNote, overallReadCalibration, connections } = profile.prep;
  const fieldLines = sections
    .map((section, i) => `${i + 1}. key="${section.key}" label="${section.label}": ${section.criteria}`)
    .join("\n");
  const unscoredKeys = sections.filter((s) => !s.scored).map((s) => s.key);
  const scoreSpec = unscoredKeys.length
    ? `<1-5, or null for ${unscoredKeys.join(" and ")}>`
    : "<1-5>";
  const alignmentNote = (connections ?? []).join("\n");
  // Empty for programs with no addendum, so their prompt is unchanged.
  const doctrineBlock = profile.doctrineAddendum ? `\n${profile.doctrineAddendum}\n` : "";
  const contentSection = hasFiles
    ? `The attendee's Proper Prep worksheet is attached below (as a document and/or slide images). Read it directly and evaluate what is actually there.${pastedText ? `\n\nAdditional notes from the attendee:\n${pastedText.slice(0, 8000)}` : ""}`
    : `PROPER PREP WORKSHEET CONTENT:\n${pastedText.slice(0, 30000)}`;

  return `You are Deckspert's Proper Prep Coach, evaluating a TPG Proper Preparation Planning Worksheet during a live persuasive storytelling training session. The attendee has shared their own prep work and wants specific, actionable feedback before they build a storyboard.

You SHOULD reference what the attendee actually wrote and give concrete, usable coaching. This is their material in a paid session, not an anonymous sample.

SCOPE: ${scopeNote}

${HUMAN_VOICE_PROTOCOL}

${WRITING_DOCTRINE}
${doctrineBlock}
EVALUATE these worksheet fields. ${SCORING_RULES}

Fields (use these exact keys and labels, in this order):
${fieldLines}

${alignmentNote}

${STYLE_PASS_CHECK}

overallRead calibration:
${overallReadCalibration}

TASK: Return a single JSON object. No markdown, no code fences:
{
  "evaluatorVersion": "session-prep-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentence read of the prep as a whole, specific to what they wrote>,
  "sectionFeedback": [
    { "key": <key>, "label": <label>, "score": ${scoreSpec}, "status": <"present"|"weak"|"missing"|"unclear">, "feedback": <1-3 sentences of specific, actionable coaching referencing their content> }
  ],
  "topFixes": [<2-4 prioritized, concrete fixes to make before building the storyboard>],
  "nextStep": <one sentence telling them what to do next>
}

${contentSection}`;
}

function fallbackEvaluation(title: string | null, profile: ProgramProfile): PrepEvaluatorResponse {
  return {
    evaluatorVersion: "session-prep-v1",
    programId: profile.id,
    title,
    overallRead: "needs work",
    executiveSummary:
      "We could not fully read this prep. Paste the worksheet content (or upload the file) and try again so we can give you specific feedback.",
    sectionFeedback: profile.prep.sections.map(({ key, label, scored }) => ({
      key,
      label,
      score: scored ? (1 as const) : null,
      status: "unclear" as const,
      feedback: `${label} could not be assessed from the provided content.`
    })),
    topFixes: ["Paste your Proper Prep worksheet content so each element can be evaluated."],
    nextStep: "Add your worksheet content and re-run the evaluation."
  };
}

export async function runPrepEvaluator(
  input: unknown,
  // Defaulted so the platform routes, which have no cohort, keep calling this
  // with one argument and keep getting the standard program.
  profile: ProgramProfile = TPG_DEFAULT
): Promise<PrepEvaluatorResponse> {
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
  const schema = makePrepResponseSchema(profile.prep.sections);
  const system = `You are Deckspert's Proper Prep Coach. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;
  const instructions = buildInstructions(title, pastedText, hasFiles, profile);

  // Stamped after parsing rather than asked of the model: another required
  // output field is another way for a generation to fail. Checked-not-scored
  // fields are also enforced here, since the model sometimes scores them anyway:
  // no number, and a filled-in field is present even if the model called it weak.
  const unscored = new Set(profile.prep.sections.filter((s) => !s.scored).map((s) => s.key));
  const stamp = (result: PrepEvaluatorResponse): PrepEvaluatorResponse => ({
    ...result,
    programId: profile.id,
    sectionFeedback: result.sectionFeedback.map((s) =>
      unscored.has(s.key)
        ? { ...s, score: null, status: s.status === "weak" ? "present" : s.status }
        : s
    )
  });

  // With an uploaded file, send rich multimodal content (PDF document / PPTX
  // slide images) so the model reads what is actually on the page, the same way
  // the platform evaluator does. Pasted-text only uses the plain text path.
  if (hasFiles) {
    const artifactBlocks = await buildUserContent(processed, "");
    const content = [{ type: "text", text: instructions }, ...artifactBlocks];
    return stamp(await callAnthropicLLMWithContent(content, {
      schema,
      model,
      system,
      maxTokens: 4096,
      fallback: () => fallbackEvaluation(title, profile)
    }));
  }

  return stamp(await callAnthropicLLM(instructions, {
    schema,
    model,
    system,
    maxTokens: 4096,
    fallback: () => fallbackEvaluation(title, profile)
  }));
}
