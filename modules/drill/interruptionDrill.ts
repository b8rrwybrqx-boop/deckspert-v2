import { z } from "zod";
import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import { HUMAN_VOICE_PROTOCOL } from "../creator/doctrine.js";
import {
  DRILL_ROUNDS,
  drillExchangeSchema,
  drillPersonaSchema,
  drillTurnResponseSchema,
  type DrillTurnResponse
} from "../../core/schemas/interruptionDrill.js";
import { TPG_DEFAULT, type ProgramProfile } from "../../core/programs/index.js";

// Runs one round of the interruption drill.
//
// LATENCY IS THE DESIGN CONSTRAINT. A session evaluator call at 4096 tokens was
// measured around 105 seconds, which is fine once and unusable five times in a
// live room. So each call does everything a round needs in one trip: it scores
// the answer just given AND writes the next interruption, and on the last round
// it returns the final report too. Token budget is kept deliberately small for
// the same reason. If the room still finds it slow, set SESSION_DRILL_MODEL to
// claude-haiku-4-5; decide that before the session, not during it.

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1600;

const drillRequestSchema = z.object({
  storyboard: z.string().min(1, "Paste your storyboard to start the drill."),
  persona: drillPersonaSchema,
  transcript: z.array(drillExchangeSchema).default([]),
  title: z.string().optional()
});

const NO_EM_DASH =
  "Do not use em-dashes (the long dash) anywhere in your output. Use commas, colons, periods, or parentheses instead.";

/**
 * How each style attacks. Drawn from the behavioral styles already in the TPG
 * doctrine, so the drill pressures the same audience model the rest of the
 * method teaches.
 */
const STYLE_PRESSURE: Record<string, string> = {
  Director:
    "Interrupts early and wants the ask immediately. Impatient with context. Cuts sentences off. Asks what the decision is and what it costs.",
  Thinker:
    "Attacks the data and the method. Wants to know where a number came from, what the sample was, and why the analysis holds. Distrusts a confident claim with thin evidence.",
  Relater:
    "Probes the people impact and the risk to the team. Asks who was consulted, who is affected, and what happens to the people currently doing the work.",
  Socializer:
    "Wanders into adjacent topics and anecdotes. Enthusiastic but derailing. Pulls the presenter off the beat with a tangent that sounds friendly."
};

/** Round 1 should be survivable; round 5 should not be comfortable. */
const PRESSURE_BY_ROUND = ["mild", "mild", "firm", "firm", "hostile"] as const;

function buildPrompt(
  storyboard: string,
  persona: z.infer<typeof drillPersonaSchema>,
  transcript: z.infer<typeof drillExchangeSchema>[],
  profile: ProgramProfile
): string {
  const round = transcript.length + 1;
  const isFinal = transcript.length >= DRILL_ROUNDS;
  const who = [persona.name, persona.role].filter(Boolean).join(", ") || `a ${persona.style} executive`;

  const history = transcript.length
    ? transcript
        .map(
          (exchange) =>
            `ROUND ${exchange.interruption.round} (${exchange.interruption.kind}, ${exchange.interruption.pressure})\nEXECUTIVE: ${exchange.interruption.text}\nPRESENTER: ${exchange.answer || "(said nothing)"}${exchange.elapsedSeconds != null ? `\n[took ${exchange.elapsedSeconds}s]` : ""}`
        )
        .join("\n\n")
    : "(nothing yet, this is the opening interruption)";

  return `You are running an INTERRUPTION DRILL in a live executive presentation skills session. You play a senior executive interrupting a presenter mid-story, and you also coach the presenter between rounds.

You are ${who}, a ${persona.style}. ${STYLE_PRESSURE[persona.style]}

${HUMAN_VOICE_PROTOCOL}

${profile.doctrineAddendum ? `${profile.doctrineAddendum}\n\n` : ""}THE PRESENTER'S STORYBOARD:
${storyboard.slice(0, 12000)}

TRANSCRIPT SO FAR:
${history}

INTERRUPTION RULES:
- Speak as the executive, in the first person, out loud. One or two sentences. Never narrate or explain yourself.
- Interrupt about THEIR material. Quote their own numbers and claims back at them. A generic challenge teaches nothing.
- Pick a kind from: getToThePoint, whatAreYouAsking, sendMeTheDeck, whatAreWeGivingUp, dontRecognizeThatNumber, triedThisBefore, whyIsThisMostImportant, derail. Do not repeat a kind already used in the transcript.
- Escalate. This round's pressure level is "${PRESSURE_BY_ROUND[Math.min(round, DRILL_ROUNDS) - 1]}". A hostile interruption is blunt and can be openly sceptical, but never abusive or personal.

SCORING RULES (for the answer just given, if there is one). Score each 1 to 5:
- heldStructure: did they return to the beat they were on, or did the question pull them off message? This is the failure mode the drill exists to attack.
- answeredTheQuestion: did they answer what was actually asked, without dodging or filibustering?
- reconnectedToRecommendation: did they get back to the anchor, the thing they are asking the room to accept?
- showedJudgment: did they name what they are giving up, or defend certainty? Naming a tradeoff scores high. "There is no downside" scores low.

Be honest. A rambling answer scores 2, not 4. An answer that ignored the question scores 1 on answeredTheQuestion however fluent it was. Then write "strongAnswer": what a strong reply would have sounded like, in their words, using their material, two or three sentences. That is the most useful thing you produce.

${isFinal ? `THIS IS THE END OF THE DRILL. Score the final answer, set "next" to null, and write "report": an overall read across all ${DRILL_ROUNDS} rounds. In the report, sectionFeedback must be exactly these four keys and labels, scored 1 to 5 as an average of their performance across the drill, with status "present" for 4-5, "weak" for 2-3, "missing" for 1:
1. key="heldStructure" label="Held the structure"
2. key="answeredTheQuestion" label="Answered the question"
3. key="reconnectedToRecommendation" label="Reconnected to the recommendation"
4. key="showedJudgment" label="Showed judgment"` : `Set "report" to null. The drill continues.`}

TASK: Return a single JSON object. No markdown, no code fences:
{
  "drillVersion": "session-drill-v1",
  "score": ${transcript.length ? `{ "round": ${transcript.length}, "heldStructure": <1-5>, "answeredTheQuestion": <1-5>, "reconnectedToRecommendation": <1-5>, "showedJudgment": <1-5>, "feedback": <1-3 sentences on that answer>, "strongAnswer": <what a strong reply sounds like> }` : "null"},
  "next": ${isFinal ? "null" : `{ "round": ${round}, "kind": <one of the kinds>, "text": <your interruption, in character>, "pressure": "${PRESSURE_BY_ROUND[Math.min(round, DRILL_ROUNDS) - 1]}" }`},
  "report": ${isFinal ? `{ "title": <short title or null>, "overallRead": <"strong"|"mixed"|"needs work">, "executiveSummary": <2-3 sentences across the whole drill>, "sectionFeedback": [<the four dimensions>], "flowNotes": [<0-3 patterns you saw across rounds>], "topFixes": [<2-4 prioritized fixes>], "nextStep": <one sentence> }` : "null"}
}`;
}

export async function runInterruptionDrill(
  input: unknown,
  profile: ProgramProfile = TPG_DEFAULT
): Promise<DrillTurnResponse> {
  const payload = drillRequestSchema.parse(input);

  if (payload.transcript.length > DRILL_ROUNDS) {
    throw new Error("This drill is already complete. Start a new one to run it again.");
  }

  const model = process.env.SESSION_DRILL_MODEL ?? DEFAULT_MODEL;
  const system = `You run interruption drills for executive presentation training. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;

  // No plausible fallback. An invented interruption that ignores their
  // storyboard would drill them against nothing, and a fabricated score would
  // be worse: they would take a number away from a round that never happened.
  return callAnthropicLLM(buildPrompt(payload.storyboard, payload.persona, payload.transcript, profile), {
    schema: drillTurnResponseSchema,
    model,
    system,
    maxTokens: MAX_TOKENS,
    fallback: () => ({
      drillVersion: "session-drill-v1" as const,
      score: null,
      next: {
        round: Math.min(payload.transcript.length + 1, DRILL_ROUNDS),
        kind: "getToThePoint" as const,
        text: "The drill engine is not configured on this environment. Tell your facilitator: nothing here is scoring your answers.",
        pressure: "mild" as const
      },
      report: null
    })
  });
}
