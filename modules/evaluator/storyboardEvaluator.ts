import { z } from "zod";
import { processArtifacts } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "./platformEvaluator.js";
import { WRITING_DOCTRINE, VISUAL_DOCTRINE, STYLE_PASS_CHECK, HUMAN_VOICE_PROTOCOL } from "../creator/doctrine.js";
import {
  makeStoryboardResponseSchema,
  type StoryboardEvaluatorResponse
} from "../../core/schemas/storyboardEvaluator.js";
import { TPG_DEFAULT, type ProgramProfile } from "../../core/programs/index.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const storyboardEvaluatorRequestSchema = z.object({
  notes: z.string().optional(),
  artifacts: z.array(z.unknown()).optional(),
  title: z.string().optional()
});

const SCORING_RULES = `Score each section 1-5 for QUALITY, then set its status from the score:
- 5 or 4 -> "present" (clearly there and doing its job)
- 3 or 2 -> "weak" (present but underdeveloped, vague, generic, or off-target). The UI labels a 3 "Needs improvement" and only a 2 "Weak", so in your feedback prose call a 3 something that needs work, never "weak".
- 1 -> "missing" (genuinely absent from the storyboard)
- only if you truly cannot tell whether it exists -> "unclear"

CRITICAL: "missing" means the section is NOT in the storyboard at all. If a section IS present but poorly executed (a placeholder, a bullet list, a weak draft), it is "weak" (score 2 or 3), never "missing". A storyboard is a draft by nature, so most present-but-rough sections should be "weak", not "missing". Judge the QUALITY of what is actually there, and when it is weak, say what is there and what would make it strong.`;

const NO_EM_DASH = `Do not use em-dashes (the long dash) anywhere in your output. Use commas, colons, periods, or parentheses instead.`;

/** Keeps "these eight story sections" reading as prose rather than a digit. */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export function buildInstructions(
  title: string | null,
  pastedText: string,
  hasFiles: boolean,
  profile: ProgramProfile = TPG_DEFAULT
): string {
  const { sections, scopeNote, overallReadCalibration, connections } = profile.storyboard;
  const sectionLines = sections
    .map((section, i) => `${i + 1}. key="${section.key}" label="${section.label}": ${section.criteria}`)
    .join("\n");
  const flowLines = (connections ?? []).map((line) => `- ${line}`).join("\n");
  // Empty for programs with no addendum, so their prompt is unchanged.
  const doctrineBlock = profile.doctrineAddendum ? `\n${profile.doctrineAddendum}\n` : "";
  const contentSection = hasFiles
    ? `The attendee's storyboard is attached below (as a document and/or slide images). Read it directly and evaluate what is actually there.${pastedText ? `\n\nAdditional notes from the attendee:\n${pastedText.slice(0, 8000)}` : ""}`
    : `STORYBOARD CONTENT:\n${pastedText.slice(0, 30000)}`;

  return `You are Deckspert's Storyboard Coach, evaluating an attendee's storyboard during a live persuasive storytelling training session. ${scopeNote}

Give concrete coaching that references what they actually wrote. This is their material in a paid session.

${HUMAN_VOICE_PROTOCOL}

${WRITING_DOCTRINE}
${doctrineBlock}
${VISUAL_DOCTRINE}

EVALUATE these ${numberWord(sections.length)} story sections. ${SCORING_RULES}

Use these exact keys and labels, in this order:
${sectionLines}

ALSO assess narrative FLOW and DISCIPLINE across the storyboard as a whole:
${flowLines}

${STYLE_PASS_CHECK}

overallRead calibration:
${overallReadCalibration}

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

function fallbackEvaluation(title: string | null, profile: ProgramProfile): StoryboardEvaluatorResponse {
  return {
    evaluatorVersion: "session-storyboard-v1",
    programId: profile.id,
    title,
    overallRead: "needs work",
    executiveSummary:
      "We could not fully read this storyboard. Paste the section-by-section content (or upload the file) and try again.",
    sectionFeedback: profile.storyboard.sections.map(({ key, label }) => ({
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

export async function runStoryboardEvaluator(
  input: unknown,
  // Defaulted so the platform routes, which have no cohort, keep calling this
  // with one argument and keep getting the standard program.
  profile: ProgramProfile = TPG_DEFAULT
): Promise<StoryboardEvaluatorResponse> {
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
  const schema = makeStoryboardResponseSchema(profile.storyboard.sections);
  const system = `You are Deckspert's Storyboard Coach. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;
  const instructions = buildInstructions(title, pastedText, hasFiles, profile);

  // programId is stamped after parsing rather than asked of the model: another
  // required output field is another way for a generation to fail, and the
  // server already knows the answer.
  const stamp = (result: StoryboardEvaluatorResponse) => ({ ...result, programId: profile.id });

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
