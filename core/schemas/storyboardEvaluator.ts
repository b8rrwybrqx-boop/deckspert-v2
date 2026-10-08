import { z } from "zod";

// Storyboard evaluator, the middle step of the live-session arc. Scores the
// story sections a program's worksheet defines, plus narrative flow and
// discipline, with specific actionable feedback before the attendee builds
// full slides.
//
// The section set is per-program (see core/programs). The enum below is the
// union of every key any profile uses, so it stays a closed set the model
// cannot invent keys outside of, while each program constrains the response
// further via makeStoryboardResponseSchema.

export const storyboardSectionKeySchema = z.enum([
  "openingGambit",
  "desiredOutcome",
  "situationRootCause",
  "bigIdea",
  "howItWorks",
  "wiifm",
  // The EPS Planning Worksheet's "Your Recommendation / Executive Takeaway".
  // Absent before 2026-09, which meant an attendee who filled the worksheet as
  // taught was scored against a framework missing its central beat.
  "recommendation",
  "close",
  "actionsNextSteps"
]);

export const storyboardSectionSchema = z.object({
  // Permissive here, narrowed per program by the factory below, which builds
  // z.enum() from that program's own keys. The exported enum above stays the
  // documented union of every key any profile may use.
  key: z.string(),
  label: z.string(),
  // Nullable for checkbox-style sections that are present or absent rather
  // than good or bad. Mirrors the prep schema.
  score: z.number().int().min(1).max(5).nullable(),
  // "toComplete": the box holds only the worksheet's own prompt, nothing the
  // attendee wrote. Unscored, and never a deduction.
  status: z.enum(["present", "weak", "missing", "unclear", "toComplete"]),
  feedback: z.string()
});

export const storyboardEvaluatorResponseSchema = z.object({
  evaluatorVersion: z.literal("session-storyboard-v1"),
  /** Attached server-side after parsing, never requested from the model. */
  programId: z.string().optional(),
  title: z.string().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z.array(storyboardSectionSchema).min(6).max(9),
  flowNotes: z.array(z.string()).min(1).max(6),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export type StoryboardEvaluatorResponse = z.infer<typeof storyboardEvaluatorResponseSchema>;

/**
 * Response schema for one program's section set.
 *
 * The exact `.length()` is the point. It is the only check that the model
 * returned every box, and core/llm/anthropic.ts retries on a Zod failure, so a
 * dropped section costs a retry instead of reaching the attendee (or, on the
 * platform path, being persisted) as a half-filled report. Do not relax it to a
 * range to accommodate a new program; give that program its own section list.
 */
export function makeStoryboardResponseSchema(sections: ReadonlyArray<{ key: string }>) {
  const keys = sections.map((s) => s.key) as [string, ...string[]];
  return storyboardEvaluatorResponseSchema.extend({
    sectionFeedback: z
      .array(storyboardSectionSchema.extend({ key: z.enum(keys) }))
      .length(sections.length)
  });
}
