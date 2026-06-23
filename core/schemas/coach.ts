import { z } from "zod";
import { artifactKindSchema } from "./artifact.js";

// Parse an array best-effort: keep the valid items and silently drop malformed
// ones instead of failing the entire array. This prevents one bad element (e.g.
// a section enum the model slightly misspelled) from discarding an otherwise
// useful coach reply via a thrown ZodError.
const lenientArray = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((values) =>
      values.flatMap((value) => {
        const result = item.safeParse(value);
        return result.success ? [result.data] : [];
      })
    );

export const coachIssueTypeSchema = z.enum([
  "bigIdea",
  "situation",
  "rootCause",
  "wiifm",
  "ask",
  "flow",
  "audience",
  "general"
]);

export const coachSectionSchema = z.enum([
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

export const coachDiagnosisSchema = z.object({
  issueType: coachIssueTypeSchema,
  summary: z.string(),
  likelyCauses: z.array(z.string()),
  suggestedFixes: z.array(z.string())
});

export const coachReframeSchema = z.object({
  label: z.string(),
  text: z.string(),
  whyItWorks: z.string()
});

export const doctrineHighlightSchema = z.object({
  title: z.string(),
  guidance: z.string()
});

export const coachEvaluationStoryReadSchema = z.object({
  summary: z.string(),
  followsKnowBelieveDo: z.enum(["yes", "partially", "no"]).catch("partially"),
  missingOrWeakSections: lenientArray(coachSectionSchema),
  structuralObservations: lenientArray(z.string())
});

export const coachEvaluationSectionScoreSchema = z.object({
  section: coachSectionSchema,
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
  recommendation: z.string()
});

export const coachEvaluationSlideQualitySchema = z.object({
  simplicity: z.string(),
  easeOfUnderstanding: z.string(),
  visualAppeal: z.string(),
  readability: z.string(),
  titleEffectiveness: z.string(),
  notableSlides: lenientArray(z.string())
});

export const coachEvaluationSlideReviewSchema = z.object({
  slideLabel: z.string(),
  simplicity: z.string(),
  easeOfUnderstanding: z.string(),
  visualAppeal: z.string(),
  readability: z.string(),
  titleEffectiveness: z.string(),
  whatIsWorking: z.string(),
  weakness: z.string(),
  opportunity: z.string()
});

export const coachEvaluationPrioritySchema = z.object({
  theme: z.string(),
  priority: z.string()
});

export const coachEvaluationSchema = z.object({
  focus: z.enum(["story", "content"]).default("story").catch("story"),
  storyRead: coachEvaluationStoryReadSchema,
  sectionScores: lenientArray(coachEvaluationSectionScoreSchema),
  slideQualityRead: coachEvaluationSlideQualitySchema,
  slideReviews: lenientArray(coachEvaluationSlideReviewSchema),
  topPriorities: lenientArray(coachEvaluationPrioritySchema)
});

export const coachAttachmentSchema = z.object({
  label: z.string(),
  kind: artifactKindSchema,
  filename: z.string().optional(),
  text: z.string().optional(),
  notes: z.string().optional(),
  sourceType: z.enum(["content", "extractedText", "visionSummary"]).optional()
});

export const coachMessageInputSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  attachments: z.array(coachAttachmentSchema).default([])
});

export const coachRequestSchema = z.object({
  messages: z.array(coachMessageInputSchema).default([])
});

export const coachResponseSchema = z.object({
  mode: z.enum(["general", "evaluation"]).default("general").catch("general"),
  // reply is the only hard-required field — it is the user-facing answer. Every
  // other field is best-effort so a malformed extra cannot discard a good reply.
  reply: z.string(),
  diagnosis: coachDiagnosisSchema.optional().catch(undefined),
  evaluation: coachEvaluationSchema.optional().catch(undefined),
  reframes: lenientArray(coachReframeSchema),
  doctrineHighlights: lenientArray(doctrineHighlightSchema),
  suggestedQuestions: lenientArray(z.string()),
  suggestedNextStep: z.string().optional().catch(undefined)
});

export type CoachDiagnosis = z.infer<typeof coachDiagnosisSchema>;
export type CoachReframe = z.infer<typeof coachReframeSchema>;
export type DoctrineHighlight = z.infer<typeof doctrineHighlightSchema>;
export type CoachEvaluation = z.infer<typeof coachEvaluationSchema>;
export type CoachAttachment = z.infer<typeof coachAttachmentSchema>;
export type CoachMessageInput = z.infer<typeof coachMessageInputSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;
