import { z } from "zod";

export const artifactKindSchema = z.enum(["image", "pdf", "pptx", "doc", "text", "video"]);

/**
 * Why a PPTX was judged to carry its content in pictures rather than text.
 * Computed during extraction (same buffer, no second download) so callers can
 * decide whether the deck needs rendering to be readable at all.
 */
export const pptxContentSignalsSchema = z.object({
  slideCount: z.number(),
  /** Characters of real slide text (a:t runs), averaged per slide. */
  charsPerSlide: z.number(),
  /** Generator that stamped the file, when it is a known deck-building tool. */
  generator: z.string().optional(),
  imageCarried: z.boolean(),
  reason: z.string().optional()
});

export type PptxContentSignals = z.infer<typeof pptxContentSignalsSchema>;

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
  visionSummary: z.string().optional(),
  pptxSignals: pptxContentSignalsSchema.optional()
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
