import { z } from "zod";
import { artifactKindSchema } from "./artifact";

export const storySections = [
  "openingGambit",
  "desiredOutcome",
  "situation",
  "rootCause",
  "bigIdea",
  "howItWorks",
  "close"
] as const;

export type StorySection = (typeof storySections)[number];

export const storySectionSchema = z.enum(storySections);

export const storySectionContentSchema = z.object({
  section: storySectionSchema,
  summary: z.string(),
  confidence: z.number().min(0).max(1).default(0.5)
});

export const behavioralStyleSchema = z.enum([
  "thinker",
  "director",
  "relater",
  "socializer",
  "unknown"
]);

export const audienceProfileSchema = z.object({
  roleLevel: z.string().nullable(),
  behavioralStyle: behavioralStyleSchema,
  behavioralStyleRationale: z.string().nullable().optional(),
  assumptions: z.array(z.string()).default([])
});

export const audienceNeedsSchema = z.object({
  core: z.array(z.string()).default([]),
  business: z.array(z.string()).default([]),
  personal: z.array(z.string()).default([])
});

export const extractedInputsSchema = z.object({
  audience: audienceProfileSchema,
  needs: audienceNeedsSchema,
  desiredOutcome: z.string().nullable(),
  reasonsYes: z.array(z.string()),
  reasonsNo: z.array(z.string()),
  situation: z.string().nullable(),
  rootCause: z.string().nullable(),
  draftBigIdea: z.string().nullable(),
  proofPoints: z.array(z.string()),
  actions: z.array(z.string()),
  constraints: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  meetingLengthMinutes: z.number().int().positive().default(30),
  minutesPerSlide: z.number().positive().default(2),
  storyComplexity: z.enum(["low", "medium", "high"]).default("medium")
});

export type ExtractedInputs = z.infer<typeof extractedInputsSchema>;

export const sectionMapProposalSchema = z.object({
  meetingLengthMinutes: z.number().int().positive().nullable().optional(),
  minutesPerSlide: z.number().positive().nullable().optional(),
  targetSlides: z.number().int().positive().nullable().optional(),
  totalSlides: z.number().int().positive(),
  slidesBySection: z.record(storySectionSchema, z.number().int().nonnegative()),
  rationale: z.string()
});

export type SectionMapProposal = z.infer<typeof sectionMapProposalSchema>;

export const artifactReferenceSchema = z.object({
  artifactId: z.string().optional(),
  label: z.string(),
  kind: artifactKindSchema,
  sourceType: z.enum(["extractedText", "visionSummary"]).optional(),
  notes: z.string().optional()
});

export const storyboardSlideSchema = z.object({
  slideIndex: z.number().int().positive(),
  section: storySectionSchema,
  title: z.string(),
  keyPoints: z.array(z.string()),
  visual: z.string(),
  speakerNotes: z.string()
});

export const storyboardSchema = z.array(storyboardSlideSchema);
export type StoryboardSlide = z.infer<typeof storyboardSlideSchema>;

export const storyboardSelfCheckSchema = z.object({
  totalSlidesGenerated: z.number().int().nonnegative(),
  sectionBreakdown: z.record(storySectionSchema, z.number().int().nonnegative()),
  withinTolerance: z.boolean(),
  notes: z.array(z.string()).default([])
});

export const creatorStoryboardSchema = z.object({
  creatorVersion: z.literal("v2"),
  sectionMap: sectionMapProposalSchema,
  storyboard: storyboardSchema,
  selfCheck: storyboardSelfCheckSchema,
  artifactsUsed: z.array(artifactReferenceSchema).optional()
});

export const creatorExtractResponseSchema = z.object({
  creatorVersion: z.literal("v2"),
  extractedInputs: extractedInputsSchema,
  sectionMapProposal: sectionMapProposalSchema,
  gaps: z.array(z.string()),
  artifactsUsed: z.array(artifactReferenceSchema).optional()
});

export const creatorGenerateResponseSchema = z.object({
  creatorVersion: z.literal("v2"),
  sectionMap: sectionMapProposalSchema,
  storyboard: storyboardSchema,
  selfCheck: storyboardSelfCheckSchema,
  artifactsUsed: z.array(artifactReferenceSchema).optional()
});

export const creatorReviseResponseSchema = z.object({
  creatorVersion: z.literal("v2"),
  sectionMap: sectionMapProposalSchema,
  revisedStoryboard: storyboardSchema,
  selfCheck: storyboardSelfCheckSchema,
  changeSummary: z.array(z.string())
});

export const creatorRevisionRequestSchema = z.object({
  revisionText: z.string(),
  target: z
    .object({
      scope: z.enum(["global", "section", "slide"]),
      section: storySectionSchema.optional(),
      slideIndex: z.number().int().positive().optional()
    })
    .optional()
});
