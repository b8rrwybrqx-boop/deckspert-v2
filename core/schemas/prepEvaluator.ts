import { z } from "zod";

// Proper Prep worksheet evaluator. Scoped to the actual fields on the TPG
// Proper Preparation Planning Worksheet: Audience, Behavioral Style/Position,
// Core/Business/Personal Needs, Desired Outcome, and Reasons to Say Yes/No.
// Storyboard-stage elements (situation, root cause, Big Idea, opening gambit,
// WIIFM, proof points) are intentionally NOT evaluated here; the Storyboard
// evaluator covers those.

export const prepEvaluatorSectionKeySchema = z.enum([
  "audience",
  "behavioralStyle",
  "coreNeeds",
  "businessNeeds",
  "personalNeeds",
  "desiredOutcome",
  "reasonsToSayYes",
  "reasonsToSayNo"
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
  sectionFeedback: z.array(prepEvaluatorSectionSchema).min(5).max(8),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export type PrepEvaluatorResponse = z.infer<typeof prepEvaluatorResponseSchema>;

export const PREP_SECTION_DEFINITIONS: Array<[z.infer<typeof prepEvaluatorSectionKeySchema>, string]> = [
  ["audience", "Audience"],
  ["behavioralStyle", "Behavioral Style & Position"],
  ["coreNeeds", "Core Needs"],
  ["businessNeeds", "Business Needs"],
  ["personalNeeds", "Personal Needs"],
  ["desiredOutcome", "Desired Outcome"],
  ["reasonsToSayYes", "Reasons to Say Yes"],
  ["reasonsToSayNo", "Reasons to Say No"]
];
