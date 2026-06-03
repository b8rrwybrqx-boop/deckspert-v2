import type { FreeEvaluatorResponse } from "../../core/schemas/freeEvaluator.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Sonnet for prose quality and voice adherence. One call per evaluation.
const DEFAULT_SCRIPT_MODEL = "claude-sonnet-4-5";

// Every script opens with this exact greeting. Prepended in code so it is always
// verbatim; the model is told not to write its own intro.
const FIXED_OPENER =
  "Hey, thanks for trying Deckspert. I'm Todd and I just reviewed your presentation. Here's a summary of a few things that are working and what I would fix first.";

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
- One clear takeaway. The listener should leave knowing exactly what to do next.
- Name the framework naturally (Opening Gambit, Big Idea, WIIFM, Close) without over-explaining it.
- End with a confident, simple CTA directing them to book a call.

NEVER
- Never manufacture praise. If a deck is weak, say so and pivot fast.
- Never list more than two strengths. It is not an awards show.
- Never write your own greeting or introduction. The script is published with a fixed opening line already in place. Do not repeat it, do not greet again, do not reintroduce yourself.

BANNED WORDS AND PHRASES (never use): leverage (as a verb), ecosystem, resilient, synergy, holistic, robust, seamless, best-in-class, innovative, move the needle, at the end of the day, in today's fast-paced world, any variation of "excited to connect".

THE FIXED OPENING (already published before your text, do not repeat it)
"${FIXED_OPENER}"

LENGTH
Your continuation runs 180 to 220 words. With the fixed opening, the full script reads aloud in 80 to 100 seconds at a natural pace. Use the room to develop the specifics, not to pad. Every sentence still earns its place.

STRUCTURE OF YOUR CONTINUATION
1. Begin immediately with what is working. Do not greet, do not reintroduce yourself. Your first sentence is about their deck. Only sections scored 3/5 or higher. Max two strengths. Be specific.
2. Top fixes. Highest-impact gaps first. Name it, say why it matters in one sentence, give one concrete next step. Deliver as One. Two. Three.
3. Close and CTA. Land the value, then direct them to book a call. Simple and confident.

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

The script is published with this fixed opening line already in place:
"${FIXED_OPENER}"

Write ONLY what comes after that line. Do not greet, do not thank them again, do not reintroduce yourself. Your first sentence is already about their deck.

Deck: ${deckName ?? "Untitled deck"}
Overall read: ${result.overallRead}
Executive summary: ${result.executiveSummary}

Section scores and feedback:
${sectionLines}

Rules for your continuation:
- Strengths: only call out sections scored 3/5 or higher. Name at most TWO. Be specific and reference the actual content shown above so the prospect knows you read their deck.
- Fixes: the weakest or missing sections, highest impact first. Up to THREE. Name each one, say why it matters in one sentence, and give one concrete next step. Deliver them as One. Two. Three.
- If almost nothing scored 3/5 or higher, say so plainly and pivot straight to the fixes. Do not manufacture praise.
- 180 to 220 words. End by telling them to book a call.`;
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
    const continuation = raw.trim();
    if (!continuation) return null;

    // Guard against the model echoing the opener despite instructions.
    const deduped = continuation.startsWith(FIXED_OPENER)
      ? continuation.slice(FIXED_OPENER.length).trim()
      : continuation;

    return `${FIXED_OPENER}\n\n${deduped}`;
  } catch (error) {
    console.warn("[Deckspert][FollowUpScript] generation failed", error instanceof Error ? error.message : error);
    return null;
  }
}
