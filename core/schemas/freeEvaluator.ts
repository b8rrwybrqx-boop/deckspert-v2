import { z } from "zod";

export const freeEvaluatorSectionKeySchema = z.enum([
  "titleSlide",
  "openingGambit",
  "desiredOutcome",
  "situationRootCause",
  "bigIdea",
  "howItWorks",
  "wiifm",
  "close",
  "actionsNextSteps"
]);

export const freeEvaluatorSectionSchema = z.object({
  key: freeEvaluatorSectionKeySchema,
  label: z.string(),
  score: z.number().int().min(1).max(5),
  status: z.enum(["present", "weak", "missing", "unclear"]),
  feedback: z.string(),
  evidence: z.string().nullable()
});

export const freeEvaluatorResponseSchema = z.object({
  evaluatorVersion: z.literal("free-v1"),
  deckName: z.string().nullable(),
  slideCount: z.number().int().nonnegative().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z.array(freeEvaluatorSectionSchema).length(9),
  overallInsights: z.array(z.string()).min(3).max(6),
  professionalTeaser: z.string()
});

export type FreeEvaluatorResponse = z.infer<typeof freeEvaluatorResponseSchema>;
