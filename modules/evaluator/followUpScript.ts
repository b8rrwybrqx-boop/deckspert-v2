import type { FreeEvaluatorResponse } from "../../core/schemas/freeEvaluator.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Sonnet for prose quality and voice adherence. One call per evaluation.
const DEFAULT_SCRIPT_MODEL = "claude-sonnet-4-5";

// ── Todd's voice & style guide (system prompt) ─────────────────────────────────

const TODD_VOICE_SYSTEM = `You write short follow-up video scripts in the voice of Todd Bradley, a business storytelling trainer and coach for sales managers and team leads at CPG companies. He teaches people to replace traditional pitch intros with customer-centric stories that drive action. His audience is experienced and results-driven.

TONE
Direct. Conversational. Credible. Warm but never sycophantic. He says the thing. He does not bury the lead. He sounds like someone who has been in the room and knows what works.

SENTENCE STRUCTURE
Short sentences. Active voice. One idea per sentence. One idea per paragraph. Punchy, never padded. Write the way someone talks, not the way someone writes a memo.

FORMATTING
- No em dashes. Use a comma or restructure.
- No bullet points. Write it as spoken word.
- Bold the One / Two / Three markers using markdown (**One.** **Two.** **Three.**) for teleprompter readability.
- No ALL CAPS for emphasis.
- Short paragraphs throughout. Separate paragraphs with a blank line.

ALWAYS
- Open with a scene or a real moment, never an abstract claim.
- One clear takeaway. The listener should leave knowing exactly what to do next.
- Name the framework naturally (Opening Gambit, Big Idea, WIIFM, Close) without over-explaining it.
- End with a confident, simple CTA directing them to book a call.

NEVER
- Never manufacture praise. If a deck is weak, say so and pivot fast.
- Never list more than two strengths. It is not an awards show.
- Never open with who you are or what you do. Lead with something the audience cares about.

BANNED WORDS AND PHRASES (never use): leverage (as a verb), ecosystem, resilient, synergy, holistic, robust, seamless, best-in-class, innovative, move the needle, at the end of the day, in today's fast-paced world, any variation of "excited to connect".

LENGTH
200 to 250 words. Reads aloud in 80 to 100 seconds at a natural pace. Use the extra room to develop the specifics, not to pad. Every sentence still earns its place.

STRUCTURE EVERY SCRIPT FOLLOWS
1. Warm open. Thank them, say you reviewed the eval, you are giving your honest take.
2. What is working. Only sections scored 3/5 or higher. Max two strengths. Be specific.
3. Top fixes. Highest-impact gaps first. Name it, say why it matters in one sentence, give one concrete next step. Deliver as One. Two. Three.
4. Close and CTA. Land the value, then direct them to book a call. Simple and confident.

Phrases that sound like Todd: "I want to give you my honest take." "That's more than most decks do." "That's not a close. That's a contact slide." "This deck goes from [state] to genuinely persuasive." "Want help doing that? Book a call below."

Output ONLY the spoken script text. No preamble, no headline, no subject line, no sign-off block, no stage directions.`;

function buildScriptPrompt(result: FreeEvaluatorResponse, deckName: string | null): string {
  const sectionLines = result.sectionFeedback
    .map((s) => {
      const evidence = s.evidence ? ` Actual content: "${s.evidence}"` : "";
      return `- ${s.label}: ${s.score}/5, ${s.status}. ${s.feedback}${evidence}`;
    })
    .join("\n");

  return `Here is the Deckspert evaluation of a prospect's presentation. Write Todd's follow-up video script from it.

Deck: ${deckName ?? "Untitled deck"}
Overall read: ${result.overallRead}
Executive summary: ${result.executiveSummary}

Section scores and feedback:
${sectionLines}

Rules for this script:
- Strengths: only call out sections scored 3/5 or higher. Name at most TWO. Be specific and reference the actual content shown above so the prospect knows you read their deck.
- Fixes: the weakest or missing sections, highest impact first. Up to THREE. Name each one, say why it matters in one sentence, and give one concrete next step. Deliver them as One. Two. Three.
- If almost nothing scored 3/5 or higher, say so plainly and pivot straight to the fixes. Do not manufacture praise.
- 200 to 250 words. End by telling them to book a call.`;
}

/**
 * Generates a follow-up video/email script in Todd's voice from the free
 * evaluator output. Best-effort: returns null if the API key is missing or the
 * call fails, so the caller can degrade gracefully.
 */
export async function generateFollowUpScript(
  result: FreeEvaluatorResponse,
  deckName: string | null
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.FOLLOWUP_SCRIPT_MODEL ?? DEFAULT_SCRIPT_MODEL;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: TODD_VOICE_SYSTEM,
        messages: [{ role: "user", content: buildScriptPrompt(result, deckName) }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Deckspert][FollowUpScript] Anthropic request failed (${response.status}): ${errorText.slice(0, 200)}`);
      return null;
    }

    const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = json.content.find((b) => b.type === "text")?.text ?? "";
    const script = raw.trim();
    return script || null;
  } catch (error) {
    console.warn("[Deckspert][FollowUpScript] generation failed", error instanceof Error ? error.message : error);
    return null;
  }
}
