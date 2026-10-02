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
- 5 -> "present" (Strong: clearly there and doing its job well)
- 4 -> "present" (Sufficient: doing its job, with room to sharpen)
- 3 -> "weak" (Needs improvement: present but underdeveloped, vague, generic, or off-target)
- 2 -> "weak" (Weak: present but falls well short)
The UI shows those anchor words (Strong, Sufficient, Needs improvement, Weak, Missing), not the status values. In your feedback prose use the same words: never call a 3 "weak" or a 4 "strong".
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
  const optionalKeys = sections.filter((s) => s.optionalInPrework).map((s) => s.key);
  const nullCases = [
    ...(unscoredKeys.length ? [unscoredKeys.join(" and ")] : []),
    ...(optionalKeys.length ? [`${optionalKeys.join(" and ")} when blank`] : [])
  ];
  const scoreSpec = nullCases.length ? `<1-5, or null for ${nullCases.join(", and ")}>` : "<1-5>";
  const alignmentNote = (connections ?? []).join("\n");
  const statusSpec = optionalKeys.length
    ? `"present"|"weak"|"missing"|"unclear"|"notYet"`
    : `"present"|"weak"|"missing"|"unclear"`;
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
    { "key": <key>, "label": <label>, "score": ${scoreSpec}, "status": <${statusSpec}>, "feedback": <1-3 sentences of specific, actionable coaching referencing their content> }
  ],
  "topFixes": [<2-4 prioritized, concrete fixes to make before building the storyboard>],
  "nextStep": <one sentence telling them what to do next>
}

${contentSection}`;
}

// A top fix is about a blank not-yet box if it names the box, or (for the
// Questions box, the only optional one today) asks the attendee to come with
// questions. Kept narrow so a fix that merely mentions "questions" in passing,
// e.g. evidence a Thinker will ask for, survives.
const QUESTIONS_FIX = /questions box|pushback|\b(two|three|four|five|a few|several|some|tough|hard)\b[^.]{0,25}\bquestions\b[^.]{0,40}\b(ready|session|prepared|bring)\b|\bquestions\b[^.]{0,15}\bready\b/i;

export function mentionsNotYetBox(fix: string, labels: string[]): boolean {
  const lower = fix.toLowerCase();
  if (labels.some((label) => lower.includes(label.toLowerCase()))) return true;
  return labels.some((label) => /question|pushback/i.test(label)) && QUESTIONS_FIX.test(fix);
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
  // Optional-in-prework boxes: a blank one has no score and is "notYet", and
  // "notYet" is never valid on any other box.
  const unscored = new Set(profile.prep.sections.filter((s) => !s.scored).map((s) => s.key));
  const optional = new Set(profile.prep.sections.filter((s) => s.optionalInPrework).map((s) => s.key));
  const stamp = (result: PrepEvaluatorResponse): PrepEvaluatorResponse => {
    const sectionFeedback = result.sectionFeedback.map((s) => {
      if (unscored.has(s.key)) {
        const status = s.status === "weak" || s.status === "notYet" ? "present" : s.status;
        return { ...s, score: null, status };
      }
      if (optional.has(s.key) && (s.status === "notYet" || s.score == null)) {
        return { ...s, score: null, status: "notYet" as const };
      }
      if (s.status === "notYet") return { ...s, status: "missing" as const, score: s.score ?? 1 };
      return s;
    });
    // The prompt says a blank not-yet box stays out of the top fixes, but the
    // model still slips one in ("come with two or three questions ready").
    // Todd wants none there, so drop it in code too.
    const notYetLabels = sectionFeedback.filter((s) => s.status === "notYet").map((s) => s.label);
    const kept = notYetLabels.length
      ? result.topFixes.filter((fix) => !mentionsNotYetBox(fix, notYetLabels))
      : result.topFixes;
    return {
      ...result,
      programId: profile.id,
      sectionFeedback,
      topFixes: kept.length ? kept : result.topFixes
    };
  };

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
