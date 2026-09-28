import { z } from "zod";

// Proper Prep worksheet evaluator. Scoped to the fields on the TPG Proper
// Preparation Planning Worksheet. Storyboard-stage elements (situation, root
// cause, Big Idea, opening gambit, WIIFM, proof points) are intentionally NOT
// evaluated here; the Storyboard evaluator covers those.
//
// The field set is per-program (see core/programs). The enum is the union of
// every key any profile uses; each program narrows it further via
// makePrepResponseSchema.

export const prepEvaluatorSectionKeySchema = z.enum([
  "audience",
  "behavioralStyle",
  "coreNeeds",
  "businessNeeds",
  "personalNeeds",
  "desiredOutcome",
  "reasonsToSayYes",
  "reasonsToSayNo",
  // The EPS deck's bonus "What": the questions and pushback to be ready for.
  // Also the natural input to the interruption drill.
  "anticipatedPushback"
]);

export const prepEvaluatorSectionSchema = z.object({
  // Permissive here, narrowed per program by the factory below, which builds
  // z.enum() from that program's own keys. The exported enum above stays the
  // documented union of every key any profile may use.
  key: z.string(),
  label: z.string(),
  // Nullable: Behavioral Style is a checkbox selection (present vs not), so it
  // carries no 1-5 quality score. All other fields are scored 1-5.
  score: z.number().int().min(1).max(5).nullable(),
  status: z.enum(["present", "weak", "missing", "unclear"]),
  feedback: z.string()
});

export const prepEvaluatorResponseSchema = z.object({
  evaluatorVersion: z.literal("session-prep-v1"),
  /** Attached server-side after parsing, never requested from the model. */
  programId: z.string().optional(),
  title: z.string().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z.array(prepEvaluatorSectionSchema).min(5).max(9),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export type PrepEvaluatorResponse = z.infer<typeof prepEvaluatorResponseSchema>;

/**
 * Response schema for one program's field set. See the note on
 * makeStoryboardResponseSchema: the exact length is the completeness check that
 * drives a retry when the model drops a field.
 */
export function makePrepResponseSchema(sections: ReadonlyArray<{ key: string }>) {
  const keys = sections.map((s) => s.key) as [string, ...string[]];
  return prepEvaluatorResponseSchema.extend({
    sectionFeedback: z
      .array(prepEvaluatorSectionSchema.extend({ key: z.enum(keys) }))
      .length(sections.length)
  });
}
