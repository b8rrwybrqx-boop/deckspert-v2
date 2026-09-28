import { z } from "zod";

// Interruption drill: Module 4, Executive Presence & Delivery.
//
// Targets the fifth failure mode the EPS deck names, "Pressure Breaks
// Structure: one tough question pulls the presenter off message". Run
// person-to-person, that block gives each attendee roughly one turn in front of
// the room. Typed and timed, everyone drills at once and gets five.
//
// The server holds no state between rounds. The client posts the whole
// transcript each turn, the same shape modules/coach uses, so a dropped
// connection costs one round rather than the session.

export const DRILL_ROUNDS = 5;

/**
 * The pressure types the deck actually teaches, rather than whatever the model
 * invents. Seeding the kind and letting it write the line against the
 * attendee's own material keeps the drill on the curriculum.
 */
export const interruptionKindSchema = z.enum([
  "getToThePoint",           // "When do you get to the point?"           (slide 15)
  "whatAreYouAsking",        // "What are you asking me to do?"           (slide 15)
  "sendMeTheDeck",           // "Send me the deck, I'll read it later."   (slide 15)
  "whatAreWeGivingUp",       // the CFO tradeoff question                 (slide 61 notes)
  "dontRecognizeThatNumber", // challenges the premise                    (slide 45)
  "triedThisBefore",
  "whyIsThisMostImportant",
  "derail"                   // an adjacent topic; tests the return to the beat
]);

export const behavioralStyleSchema = z.enum(["Director", "Thinker", "Relater", "Socializer"]);

export const drillPersonaSchema = z.object({
  style: behavioralStyleSchema,
  name: z.string().optional(),
  role: z.string().optional()
});

export const interruptionSchema = z.object({
  round: z.number().int().min(1).max(DRILL_ROUNDS),
  kind: interruptionKindSchema,
  /** The line itself, in the executive's voice. */
  text: z.string(),
  pressure: z.enum(["mild", "firm", "hostile"])
});

/**
 * One exchange, scored on the four things the deck teaches under pressure.
 * `strongAnswer` carries most of the coaching value: seeing what a good reply
 * sounds like against their own material beats being told the reply was weak.
 */
export const turnScoreSchema = z.object({
  round: z.number().int().min(1).max(DRILL_ROUNDS),
  heldStructure: z.number().int().min(1).max(5),
  answeredTheQuestion: z.number().int().min(1).max(5),
  reconnectedToRecommendation: z.number().int().min(1).max(5),
  showedJudgment: z.number().int().min(1).max(5),
  feedback: z.string(),
  strongAnswer: z.string()
});

/** Matches the structured result the other session tools render and print. */
export const drillReportSchema = z.object({
  title: z.string().nullable(),
  overallRead: z.enum(["strong", "mixed", "needs work"]),
  executiveSummary: z.string(),
  sectionFeedback: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        score: z.number().int().min(1).max(5).nullable(),
        status: z.enum(["present", "weak", "missing", "unclear"]),
        feedback: z.string()
      })
    )
    .length(4),
  flowNotes: z.array(z.string()).max(5).optional(),
  topFixes: z.array(z.string()).min(1).max(5),
  nextStep: z.string()
});

export const drillTurnResponseSchema = z.object({
  drillVersion: z.literal("session-drill-v1"),
  /** Null on the opening call; there is no prior answer to score. */
  score: turnScoreSchema.nullable(),
  /** Null once the last round has been answered. */
  next: interruptionSchema.nullable(),
  /** Present only on the final turn, so the drill ends in one round trip. */
  report: drillReportSchema.nullable()
});

export const drillExchangeSchema = z.object({
  interruption: interruptionSchema,
  answer: z.string(),
  /** Seconds the attendee took. Reported, never scored. */
  elapsedSeconds: z.number().int().min(0).max(3600).optional()
});

export type InterruptionKind = z.infer<typeof interruptionKindSchema>;
export type DrillPersona = z.infer<typeof drillPersonaSchema>;
export type Interruption = z.infer<typeof interruptionSchema>;
export type TurnScore = z.infer<typeof turnScoreSchema>;
export type DrillReport = z.infer<typeof drillReportSchema>;
export type DrillTurnResponse = z.infer<typeof drillTurnResponseSchema>;
export type DrillExchange = z.infer<typeof drillExchangeSchema>;

export const DRILL_DIMENSIONS: Array<[keyof Pick<TurnScore, "heldStructure" | "answeredTheQuestion" | "reconnectedToRecommendation" | "showedJudgment">, string]> = [
  ["heldStructure", "Held the structure"],
  ["answeredTheQuestion", "Answered the question"],
  ["reconnectedToRecommendation", "Reconnected to the recommendation"],
  ["showedJudgment", "Showed judgment"]
];
