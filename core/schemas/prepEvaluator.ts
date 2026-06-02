import { z } from "zod";

// Proper Prep worksheet evaluator, used live in training. Unlike the public
// free evaluator (deliberately generic), this gives attendees specific,
// actionable feedback on their own prep before they build a storyboard.

export const prepEvaluatorSectionKeySchema = z.enum([
  "audience",
  "desiredOutcome",
  "reasonsYesNo",
  "situationComplication",
  "rootCause",
  "bigIdea",
  "openingGambit",
  "wiifm",
  "proofPoints"
]);

export const prepEvaluatorSectionSchema = z.object({
  key: prepEvaluatorSectionKeySchema,
  label: z.string(),
  score: z.number().int().min(1).max(5),
  status: z.enum(["present", "weak", "missing", "unclear"]),
  feedback: z.string()
});

export const prepEvaluatorResponseSchema = z.object({
  evaluatorVersion: z.literal("session-prep-v1"),
  title: z.string().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z.array(prepEvaluatorSectionSchema).min(5).max(9),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export type PrepEvaluatorResponse = z.infer<typeof prepEvaluatorResponseSchema>;

export const PREP_SECTION_DEFINITIONS: Array<[z.infer<typeof prepEvaluatorSectionKeySchema>, string]> = [
  ["audience", "Audience & Behavioral Style"],
  ["desiredOutcome", "Desired Outcome"],
  ["reasonsYesNo", "Reasons to Say Yes / No"],
  ["situationComplication", "Situation & Complication"],
  ["rootCause", "Root Cause"],
  ["bigIdea", "Big Idea"],
  ["openingGambit", "Opening Gambit"],
  ["wiifm", "WIIFM"],
  ["proofPoints", "Proof Points"]
];
