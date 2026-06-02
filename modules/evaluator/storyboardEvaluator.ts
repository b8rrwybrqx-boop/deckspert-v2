import { z } from "zod";
import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM } from "../../core/llm/anthropic.js";
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

function buildPrompt(title: string | null, text: string): string {
  return `You are Deckspert's Storyboard Coach, evaluating an attendee's storyboard during a live persuasive storytelling training session. They have moved past prep and drafted the narrative structure of their presentation; they want specific, actionable feedback before building full slides.

Give concrete coaching that references what they actually wrote — this is their material in a paid session.

${WRITING_DOCTRINE}

${VISUAL_DOCTRINE}

EVALUATE these eight story sections. Score each 1–5 and assign a status:
- score 5 or 4 → "present"; 3 → "weak"; 2 → "missing"; 1 → "missing"; cannot assess → "unclear" (score 1).

Use these exact keys and labels, in this order:
1. key="openingGambit" label="Opening Gambit" — emotional hook that creates tension, not data.
2. key="desiredOutcome" label="Desired Outcome" — explicit ask, stated early.
3. key="situationRootCause" label="Situation / Root Cause" — real complication + named root cause, not just context.
4. key="bigIdea" label="Big Idea" — a belief the audience must accept; reframes the issue; not a tactic.
5. key="howItWorks" label="How It Works" — actions that clearly address the root cause.
6. key="wiifm" label="WIIFM" — addresses core, business, and personal needs; not a restatement of the plan.
7. key="close" label="Close" — restates the recommendation, reinforces WIIFM, makes an explicit ask.
8. key="actionsNextSteps" label="Actions & Next Steps" — owners, timing, commitments.

ALSO assess narrative FLOW & DISCIPLINE across the storyboard as a whole:
- Does the sequence build tension → reframe → resolution, or does it sag?
- Is section discipline respected (roughly: Opening Gambit 1, Desired Outcome 1, Root Cause 1, Big Idea 1, How It Works 2–4, WIIFM/Close tight)? Flag bloat or missing beats.
- Does each beat earn its place, or are there detours that belong in an appendix?

${STYLE_PASS_CHECK}

overallRead calibration:
- "needs work" → 3+ sections score 1, OR Big Idea + Desired Outcome + Close all absent.
- "mixed" → real strengths with 1–2 critical gaps or flow problems.
- "strong" → no section below 3, key sections (Opening Gambit, Desired Outcome, Big Idea, Close) score 4+, and flow builds cleanly.

TASK: Return a single JSON object — no markdown, no code fences:
{
  "evaluatorVersion": "session-storyboard-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "null"},
  "overallRead": <"strong" | "mixed" | "needs work">,
  "executiveSummary": <2-3 sentences specific to this storyboard>,
  "sectionFeedback": [ { "key": <key>, "label": <label>, "score": <1-5>, "status": <status>, "feedback": <1-3 sentences of specific coaching> } ],
  "flowNotes": [<1-4 observations about sequence, discipline, and pacing>],
  "topFixes": [<2-4 prioritized fixes before building slides>],
  "nextStep": <one sentence on what to do next>
}

STORYBOARD CONTENT:
${text.slice(0, 30000)}`;
}

function fallbackEvaluation(title: string | null): StoryboardEvaluatorResponse {
  return {
    evaluatorVersion: "session-storyboard-v1",
    title,
    overallRead: "needs work",
    executiveSummary:
      "We couldn't fully read this storyboard. Paste the section-by-section content (or upload the file) and try again.",
    sectionFeedback: STORYBOARD_SECTION_DEFINITIONS.map(([key, label]) => ({
      key,
      label,
      score: 1 as const,
      status: "unclear" as const,
      feedback: `${label} could not be assessed from the provided content.`
    })),
    flowNotes: ["Flow could not be assessed — add your storyboard content."],
    topFixes: ["Paste your storyboard, section by section, so it can be evaluated."],
    nextStep: "Add your storyboard content and re-run the evaluation."
  };
}

export async function runStoryboardEvaluator(input: unknown): Promise<StoryboardEvaluatorResponse> {
  const payload = storyboardEvaluatorRequestSchema.parse(input);
  const title = payload.title?.trim() || null;

  const uploaded = createArtifacts(payload.artifacts ?? []);
  const processed = await processArtifacts(uploaded);
  const text = [payload.notes ?? "", flattenArtifactText(processed)].filter(Boolean).join("\n\n").trim();

  if (!text) {
    throw new Error("Paste your storyboard content (or upload the file) to get feedback.");
  }

  return callAnthropicLLM(buildPrompt(title, text), {
    schema: storyboardEvaluatorResponseSchema,
    model: process.env.SESSION_EVALUATOR_MODEL ?? DEFAULT_MODEL,
    system: "You are Deckspert's Storyboard Coach. Return only valid JSON — no markdown, no code fences.",
    maxTokens: 4096,
    fallback: () => fallbackEvaluation(title)
  });
}
