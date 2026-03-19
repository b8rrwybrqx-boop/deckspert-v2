import { z } from "zod";

export const acceptedMimeTypes = ["video/mp4", "video/quicktime"] as const;

export const createJobRequestSchema = z.object({
  originalFilename: z.string().min(1),
  originalBlobUrl: z.string().url(),
  fileSize: z.number().int().positive().max(600 * 1024 * 1024),
  mimeType: z.enum(acceptedMimeTypes),
  userContext: z.string().max(3000).optional().nullable()
});
