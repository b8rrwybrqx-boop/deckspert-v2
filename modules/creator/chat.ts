import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import { z } from "zod";
import type { ExtractedInputs, StorylineSection, SlideOutlineItem } from "../../core/schemas/story.js";

// We accept a lenient shape from the model and normalize after parse. Strict
// enums on action.type kept rejecting valid intent (e.g. the model returns
// "modify-outline" or "regenerate_outline" or "update-storyline"), which
// silently dropped the user into the fallback. Now we accept any string and
// coerce it to the canonical type below.
const lenientChatResponseSchema = z.object({
  reply: z.string(),
  action: z
    .object({
      // EVERY field optional. The model sometimes emits action: {} when it
      // wants to ask a clarifying question — required fields would silently
      // bounce the entire response into the canned fallback.
      type: z.string().optional().default(""),
      directive: z.string().optional().default(""),
      label: z.string().optional().default("")
    })
    // .nullish() accepts both null and undefined. The model sometimes emits
    // "action": null instead of omitting the field; .optional() alone would
    // reject that with "Expected object, received null" → fallback.
    .nullish()
});

export const chatResponseSchema = z.object({
  reply: z.string(),
  action: z.object({
    type: z.enum(["regenerate-storyline", "regenerate-outline"]),
    directive: z.string(),
    label: z.string()
  }).optional()
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Map whatever the LLM sent into one of the two real action types, or null
// if it doesn't look like a regen request.
function normalizeActionType(raw: string): "regenerate-storyline" | "regenerate-outline" | null {
  const s = raw.toLowerCase().replace(/[_\s]+/g, "-");
  if (s.includes("storyline")) return "regenerate-storyline";
  if (s.includes("outline") || s.includes("slide") || s.includes("section")) return "regenerate-outline";
  return null;
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type InputContext = {
  notesSnippet?: string;
  documentLabels?: string;
};

export function buildChatSystemPrompt(
  step: string,
  confirmedInputs?: ExtractedInputs | null,
  storyline?: StorylineSection[] | null,
  targetTool?: string,
  inputContext?: InputContext,
  outline?: SlideOutlineItem[] | null
): string {
  const ctx: string[] = [];

  if (inputContext?.documentLabels || inputContext?.notesSnippet) {
    const parts: string[] = ["USER HAS PROVIDED THE FOLLOWING INPUT:"];
    if (inputContext.documentLabels) parts.push(`Uploaded documents: ${inputContext.documentLabels}`);
    if (inputContext.notesSnippet) parts.push(`Notes (excerpt): ${inputContext.notesSnippet}`);
    ctx.push(parts.join("\n"));
  }

  if (confirmedInputs) {
    ctx.push(`CURRENT PROPER PREP CONTEXT:
Audience: ${confirmedInputs.audience.roleLevel ?? "Not specified"}
Behavioral style: ${confirmedInputs.audience.behavioralStyle}
Desired Outcome: ${confirmedInputs.desiredOutcome ?? "Not specified"}
Situation: ${confirmedInputs.situation ?? "Not specified"}
Root Cause: ${confirmedInputs.rootCause ?? "Not specified"}
Draft Big Idea: ${confirmedInputs.draftBigIdea ?? "Not specified"}
Core Needs: ${confirmedInputs.needs.core.join("; ") || "Not specified"}
Business Needs: ${confirmedInputs.needs.business.join("; ") || "Not specified"}
Personal Needs: ${confirmedInputs.needs.personal.join("; ") || "Not specified"}
Reasons Yes: ${confirmedInputs.reasonsYes.join("; ") || "Not specified"}
Objections: ${confirmedInputs.reasonsNo.join("; ") || "Not specified"}`);
  }

  if (storyline?.length) {
    ctx.push(`CURRENT STORYLINE:
${storyline.map(s => `${s.label}:\n  Headline: ${s.takeawayHeadline}\n  Narrative: ${s.narrative?.slice(0, 200) ?? "—"}`).join("\n\n")}`);
  }

  if (outline?.length) {
    ctx.push(`CURRENT SLIDE OUTLINE (${outline.length} slides):
${outline.map(s => {
  const bullets = s.bullets?.length
    ? s.bullets.map(b => `    - ${b}`).join("\n")
    : "    (no bullets)";
  return `Slide ${s.slideNumber} [${s.sectionLabel}]: ${s.headline}\n${bullets}`;
}).join("\n\n")}`);
  }

  if (targetTool) {
    ctx.push(`TARGET PRESENTATION TOOL: ${targetTool}`);
  }

  return `You are a concise story-building assistant embedded in a presentation creator tool. Current step: ${step}.

${ctx.join("\n\n")}

YOUR ROLE:
- Help the user refine their persuasive story through natural conversation.
- Answer questions about story structure, framing, and audience strategy directly and briefly.
- CRITICAL: You CANNOT modify the storyline or outline yourself. Only the Apply button below your reply actually makes the change. NEVER say "Applied", "Done", "Updated", or any past-tense phrase implying the change already happened. Always say "Click Apply below to update your storyline" or similar.
- Be direct. No filler phrases ("Great!", "Absolutely!"). Max 3-4 sentences per reply.
- Never mention methodology framework names, author names, or internal doctrine labels.
- When on "input" step: if the user has uploaded documents or pasted notes (shown in USER HAS PROVIDED THE FOLLOWING INPUT above), you can confirm what you see and encourage them to click Extract. If they ask to "build a deck" or similar, remind them to click the Extract button to process their input first.
- When on "properPrep" step: help them review and refine the extracted inputs before generating the storyline.
- Only suggest storyline/outline changes when the user has an actual storyline (step = "storyline" or "outline").

WHEN TO ASK VS. ACT (important):
- Prefer asking ONE clarifying question over guessing. It is better to ask than to ship an Apply action that targets the wrong section or scope.
- Ask before acting when ANY of these is true:
  • The user describes a change but doesn't say WHICH section/slide it applies to (e.g. "expand the benefit" — is that Big Idea, WIIFM, How It Works, or specific slides?).
  • The change could be done at the storyline level OR the outline level and the choice meaningfully changes the result. (Storyline edits force an outline rebuild and may cost more changes than they want.)
  • The request adds new substantive content (a new claim, proof point, or framing) without saying where it should land.
  • The user is on the "outline" step but the request reads like a storyline-level concept change.
- Skip the clarifying question when the request is concrete and unambiguous (e.g. "remove the bullets on slide 1", "make slide 4's headline shorter", "add a number to the WIIFM headline").
- When you ask a clarifying question, OMIT the action field entirely. Do not pre-stage an Apply button for the user to click — wait for their answer.

RESPONSE FORMAT -- return only this JSON, no markdown, no fences:
{
  "reply": "Your conversational response (2-4 sentences). If you need to clarify, ask exactly ONE specific question with 2-3 concrete options.",
  "action": {
    "type": "regenerate-storyline" | "regenerate-outline",
    "directive": "Precise instruction for the regeneration engine -- specific enough to act on without further context",
    "label": "Apply: [5-7 word description]"
  }
}

Include "action" ONLY when (a) the user has explicitly asked for a change AND (b) the target section/slide and scope are unambiguous. Omit it for questions, general advice, ambiguous requests, clarifying questions you're asking back, or when they don't yet have a storyline.`;
}

// Build the exact { system, prompt } pair that runCreatorChat sends to the
// LLM. Exported so the debug endpoint can replicate the call without going
// through schema validation.
export function buildChatPrompts(
  messages: ChatHistoryMessage[],
  step: string,
  confirmedInputs?: ExtractedInputs | null,
  storyline?: StorylineSection[] | null,
  targetTool?: string,
  inputContext?: InputContext,
  outline?: SlideOutlineItem[] | null
): { system: string; prompt: string } {
  const system = buildChatSystemPrompt(step, confirmedInputs, storyline, targetTool, inputContext, outline);
  // Keep the last 10 messages but ALWAYS end on a user turn — drop trailing
  // assistant messages so the model isn't asked to "respond" to its own
  // previous reply (which happens when the user clicks a button without
  // sending another message, or when an autoreply gets queued).
  const trimmed = messages.slice(-10);
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== "user") {
    trimmed.pop();
  }
  const formatted = trimmed
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  // Empty history (e.g. dropped everything because the only entries were
  // assistant-side) — fall back to the original last user message in the
  // unfiltered list so we still send something coherent.
  const prompt = formatted
    || `User: ${messages.slice().reverse().find((m) => m.role === "user")?.content ?? ""}`;
  return { system, prompt };
}

export async function runCreatorChat(
  messages: ChatHistoryMessage[],
  step: string,
  confirmedInputs?: ExtractedInputs | null,
  storyline?: StorylineSection[] | null,
  targetTool?: string,
  inputContext?: InputContext,
  outline?: SlideOutlineItem[] | null
): Promise<ChatResponse> {
  const { system, prompt } = buildChatPrompts(messages, step, confirmedInputs, storyline, targetTool, inputContext, outline);

  // Parse leniently and normalize. The strict enum on action.type was the
  // source of repeated fallback hits — the model emits variants like
  // "modify-outline", "regenerate_outline", "update-storyline".
  const lenient = await callAnthropicLLM(prompt, {
    schema: lenientChatResponseSchema,
    system,
    model: "claude-haiku-4-5",
    // 600 was too tight: when the directive describes a substantive rewrite,
    // the JSON response was truncated mid-string and silently fell back.
    maxTokens: 1500,
    fallback: () => ({
      reply: "I'm here to help you refine your story. What would you like to adjust?",
      action: undefined
    })
  });

  // Coerce the lenient action into the canonical shape (or drop it). An
  // action without a real type — e.g. action: {} for a clarifying question
  // — should produce a reply with no Apply button, not a fallback.
  let action: ChatResponse["action"] | undefined;
  if (lenient.action && lenient.action.type) {
    const normalized = normalizeActionType(lenient.action.type);
    if (normalized && lenient.action.directive && lenient.action.label) {
      action = {
        type: normalized,
        directive: lenient.action.directive,
        label: lenient.action.label
      };
    }
  }
  return { reply: lenient.reply, action };
}
