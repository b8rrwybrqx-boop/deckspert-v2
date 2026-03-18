import { z } from "zod";

export const acceptedMimeTypes = ["video/mp4", "video/quicktime"] as const;

export const deliveryStatusSchema = z.enum([
  "uploaded",
  "queued",
  "compressing",
  "extracting_audio",
  "transcribing",
  "sampling_frames",
  "generating_coaching",
  "complete",
  "failed"
]);

export const createJobRequestSchema = z.object({
  originalFilename: z.string().min(1),
  originalBlobUrl: z.string().url(),
  fileSize: z.number().int().positive().max(600 * 1024 * 1024),
  mimeType: z.enum(acceptedMimeTypes),
  userContext: z.string().max(3000).optional().nullable()
});

export const transcriptSegmentSchema = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string().min(1),
  speaker: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable()
});

export const visualSignalSchema = z.object({
  timestamp: z.string(),
  timestampSec: z.number().nonnegative(),
  frameUrl: z.string().url().optional(),
  facePresent: z.boolean().nullable().default(null),
  faceCount: z.number().int().nullable().default(null),
  framingConsistency: z.enum(["consistent", "mixed", "unknown"]).default("unknown"),
  motionLevel: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
  handVisibility: z.enum(["visible", "limited", "unknown"]).default("unknown"),
  notes: z.string().optional()
});

export const coachingMomentSchema = z.object({
  timestamp: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  title: z.string(),
  observation: z.string(),
  whyItMatters: z.string(),
  coachingTip: z.string(),
  severity: z.enum(["low", "medium", "high"])
});

export const practicePlanItemSchema = z.object({
  focusArea: z.string(),
  exercise: z.string(),
  frequency: z.string(),
  goal: z.string()
});

export const coachingReportSchema = z.object({
  executiveSummary: z.string(),
  overallScore: z.number().min(1).max(10),
  dimensionScores: z.object({
    voicePacing: z.number().min(1).max(10),
    presenceConfidence: z.number().min(1).max(10),
    bodyLanguage: z.number().min(1).max(10),
    audienceEngagement: z.number().min(1).max(10)
  }),
  topStrengths: z.array(z.string()).min(1).max(3),
  topPriorityFixes: z.array(z.string()).min(1).max(3),
  coachingMoments: z.array(coachingMomentSchema),
  practicePlan: z.array(practicePlanItemSchema).min(1).max(4),
  processingNotes: z.object({
    transcriptConfidence: z.string(),
    visualConfidence: z.string(),
    limitations: z.array(z.string())
  })
});

export const processingEventSchema = z.object({
  stage: z.string(),
  message: z.string(),
  metadataJson: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string()
});

export const deliveryJobSchema = z.object({
  id: z.string(),
  status: deliveryStatusSchema,
  originalFilename: z.string(),
  originalBlobUrl: z.string().url(),
  analysisBlobUrl: z.string().url().nullable().optional(),
  audioBlobUrl: z.string().url().nullable().optional(),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  userContext: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  failedAt: z.string().nullable().optional(),
  events: z.array(processingEventSchema).optional(),
  report: coachingReportSchema.nullable().optional()
});

export function validateUploadFile(file: File) {
  if (!acceptedMimeTypes.includes(file.type as (typeof acceptedMimeTypes)[number])) {
    throw new Error("Only MP4 and MOV presentation videos are supported in this MVP.");
  }
  if (file.size > 600 * 1024 * 1024) {
    throw new Error("Files above 600 MB are blocked in the MVP to keep uploads reliable.");
  }
}
