import { z } from "zod";

export const deliveryDimensionSchema = z.object({
  label: z.string(),
  rating: z.enum(["strong", "mixed", "needs work"]),
  feedback: z.string(),
  coachingTip: z.string()
});

export const evaluationResponseSchema = z.object({
  overallDelivery: z.enum(["strong", "mixed", "needs work"]),
  summary: z.string(),
  deliveryDimensions: z.array(deliveryDimensionSchema),
  keyStrengths: z.array(z.string()),
  coachingPriorities: z.array(z.string()),
  practiceDrills: z.array(z.string()),
  nextStep: z.string()
});

export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;
