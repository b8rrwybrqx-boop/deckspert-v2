import { z } from "zod";
import { artifactKindSchema } from "./artifact.js";

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
  followsKnowBelieveDo: z.enum(["yes", "partially", "no"]),
  missingOrWeakSections: z.array(coachSectionSchema).default([]),
  structuralObservations: z.array(z.string()).default([])
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
  notableSlides: z.array(z.string()).default([])
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
  focus: z.enum(["story", "content"]).default("story"),
  storyRead: coachEvaluationStoryReadSchema,
  sectionScores: z.array(coachEvaluationSectionScoreSchema).default([]),
  slideQualityRead: coachEvaluationSlideQualitySchema,
  slideReviews: z.array(coachEvaluationSlideReviewSchema).default([]),
  topPriorities: z.array(coachEvaluationPrioritySchema).default([])
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
  mode: z.enum(["general", "evaluation"]).default("general"),
  reply: z.string(),
  diagnosis: coachDiagnosisSchema.optional(),
  evaluation: coachEvaluationSchema.optional(),
  reframes: z.array(coachReframeSchema).default([]),
  doctrineHighlights: z.array(doctrineHighlightSchema).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  suggestedNextStep: z.string().optional()
});

export type CoachDiagnosis = z.infer<typeof coachDiagnosisSchema>;
export type CoachReframe = z.infer<typeof coachReframeSchema>;
export type DoctrineHighlight = z.infer<typeof doctrineHighlightSchema>;
export type CoachEvaluation = z.infer<typeof coachEvaluationSchema>;
export type CoachAttachment = z.infer<typeof coachAttachmentSchema>;
export type CoachMessageInput = z.infer<typeof coachMessageInputSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;
