import { z } from "zod";

export const artifactKindSchema = z.enum(["image", "pdf", "pptx", "doc", "text", "video"]);

export const artifactSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: artifactKindSchema,
  filename: z.string().optional(),
  contentType: z.string().optional(),
  fileDataBase64: z.string().optional(),
  sourceUrl: z.string().optional(),
  content: z.string().optional(),
  extractedText: z.string().optional(),
  visionSummary: z.string().optional()
});

export type Artifact = z.infer<typeof artifactSchema>;

export const artifactInputSchema = artifactSchema.partial({
  id: true,
  extractedText: true,
  visionSummary: true
}).required({
  label: true,
  kind: true
});

export const artifactBatchSchema = z.array(artifactInputSchema);
