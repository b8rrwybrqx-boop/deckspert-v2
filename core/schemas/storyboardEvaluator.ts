import { z } from "zod";

// Storyboard evaluator — the middle step of the live-session arc. Scores the
// eight TPG story sections plus narrative flow/discipline, with specific,
// actionable feedback before the attendee builds full slides.

export const storyboardSectionKeySchema = z.enum([
  "openingGambit",
  "desiredOutcome",
  "situationRootCause",
  "bigIdea",
  "howItWorks",
  "wiifm",
  "close",
  "actionsNextSteps"
]);

export const storyboardSectionSchema = z.object({
  key: storyboardSectionKeySchema,
  label: z.string(),
  score: z.number().int().min(1).max(5),
  status: z.enum(["present", "weak", "missing", "unclear"]),
  feedback: z.string()
});

export const storyboardEvaluatorResponseSchema = z.object({
  evaluatorVersion: z.literal("session-storyboard-v1"),
  title: z.string().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z.array(storyboardSectionSchema).min(6).max(8),
  flowNotes: z.array(z.string()).min(1).max(5),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export type StoryboardEvaluatorResponse = z.infer<typeof storyboardEvaluatorResponseSchema>;

export const STORYBOARD_SECTION_DEFINITIONS: Array<[z.infer<typeof storyboardSectionKeySchema>, string]> = [
  ["openingGambit", "Opening Gambit"],
  ["desiredOutcome", "Desired Outcome"],
  ["situationRootCause", "Situation / Root Cause"],
  ["bigIdea", "Big Idea"],
  ["howItWorks", "How It Works"],
  ["wiifm", "WIIFM"],
  ["close", "Close"],
  ["actionsNextSteps", "Actions & Next Steps"]
];
