import { z } from "zod";

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

export const coachResponseSchema = z.object({
  reply: z.string(),
  diagnosis: coachDiagnosisSchema.optional(),
  reframes: z.array(coachReframeSchema).default([]),
  doctrineHighlights: z.array(doctrineHighlightSchema).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  suggestedNextStep: z.string().optional()
});

export type CoachDiagnosis = z.infer<typeof coachDiagnosisSchema>;
export type CoachReframe = z.infer<typeof coachReframeSchema>;
export type DoctrineHighlight = z.infer<typeof doctrineHighlightSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;
