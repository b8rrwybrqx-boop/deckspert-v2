import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import { z } from "zod";
import type { ExtractedInputs, StorylineSection, SlideOutlineItem } from "../../core/schemas/story.js";

export const chatResponseSchema = z.object({
  reply: z.string(),
  action: z.object({
    type: z.enum(["regenerate-storyline", "regenerate-outline"]),
    directive: z.string(),
    label: z.string()
  }).optional()
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type InputContext = {
  notesSnippet?: string;
  documentLabels?: string;
};

function buildChatSystemPrompt(
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
- When the user wants a change to the storyline or outline, explain WHY it will improve the story (1-2 sentences), then include an action so they can apply it with one click.
- CRITICAL: You CANNOT modify the storyline or outline yourself. Only the Apply button below your reply actually makes the change. NEVER say "Applied", "Done", "Updated", or any past-tense phrase implying the change already happened. Always say "Click Apply below to update your storyline" or similar.
- Be direct. No filler phrases ("Great!", "Absolutely!"). Max 3-4 sentences per reply.
- Never mention methodology framework names, author names, or internal doctrine labels.
- When on "input" step: if the user has uploaded documents or pasted notes (shown in USER HAS PROVIDED THE FOLLOWING INPUT above), you can confirm what you see and encourage them to click Extract. If they ask to "build a deck" or similar, remind them to click the Extract button to process their input first.
- When on "properPrep" step: help them review and refine the extracted inputs before generating the storyline.
- Only suggest storyline/outline changes when the user has an actual storyline (step = "storyline" or "outline").

RESPONSE FORMAT -- return only this JSON, no markdown, no fences:
{
  "reply": "Your conversational response (2-4 sentences)",
  "action": {
    "type": "regenerate-storyline" | "regenerate-outline",
    "directive": "Precise instruction for the regeneration engine -- specific enough to act on without further context",
    "label": "Apply: [5-7 word description]"
  }
}

Include "action" ONLY when the user is explicitly asking for a change to the storyline or outline. Omit it for questions, general advice, or when they don't yet have a storyline.`;
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
  const system = buildChatSystemPrompt(step, confirmedInputs, storyline, targetTool, inputContext, outline);

  // Keep last 10 messages for context, build a conversational prompt
  const history = messages.slice(-10);
  const prior = history.slice(0, -1)
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const latest = history[history.length - 1]?.content ?? "";
  const prompt = prior ? `${prior}\n\nUser: ${latest}` : `User: ${latest}`;

  return callAnthropicLLM(prompt, {
    schema: chatResponseSchema,
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
}
