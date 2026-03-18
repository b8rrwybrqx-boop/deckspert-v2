import type { z } from "zod";

import type {
  coachingReportSchema,
  createJobRequestSchema,
  deliveryJobSchema,
  processingEventSchema,
  transcriptSegmentSchema,
  visualSignalSchema
} from "../lib/validation/delivery";
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export type DeliveryJobRecord = z.infer<typeof deliveryJobSchema>;
export type TranscriptSegmentRecord = z.infer<typeof transcriptSegmentSchema>;
export type ProcessingEventRecord = z.infer<typeof processingEventSchema>;
export type CoachingReport = z.infer<typeof coachingReportSchema>;
export type VisualSignal = z.infer<typeof visualSignalSchema>;

export type UploadState = "idle" | "uploading" | "uploaded" | "error";
