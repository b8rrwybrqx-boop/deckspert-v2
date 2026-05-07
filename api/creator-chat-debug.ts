// Debug endpoint that mirrors /api/creator-chat but returns the raw Anthropic
// response, the system prompt, and any parse/normalize errors instead of the
// normalized chat reply. Use this to inspect exactly what the model is
// emitting when the chat falls back to the canned message.
//
// POST /api/creator-chat-debug with the same body as /api/creator-chat.
// Auth-gated to the signed-in user. Bypasses schema validation entirely.
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { buildChatPrompts, runCreatorChat } from "../modules/creator/chat.js";
import { z } from "zod";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

const debugRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })).min(1).max(20),
  step: z.string(),
  confirmedInputs: z.unknown().optional().nullable(),
  storyline: z.array(z.unknown()).optional().nullable(),
  outline: z.array(z.unknown()).optional().nullable(),
  targetTool: z.string().optional(),
  inputContext: z.object({
    notesSnippet: z.string().optional(),
    documentLabels: z.string().optional()
  }).optional().nullable()
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) return;
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const payload = readJsonBody<unknown>(req);
    const parsed = debugRequestSchema.parse(payload);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.CREATOR_MODEL ?? "claude-haiku-4-5";

    if (!apiKey) {
      res.status(200).json({
        ok: false,
        reason: "ANTHROPIC_API_KEY missing in production env"
      });
      return;
    }

    // Build the exact prompts the chat would send.
    const { system, prompt } = buildChatPrompts(
      parsed.messages,
      parsed.step,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed.confirmedInputs as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed.storyline as any,
      parsed.targetTool,
      parsed.inputContext ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed.outline as any
    );

    // Call Anthropic directly so we can capture the literal text the model
    // returned, before any JSON parsing or schema validation.
    let rawText: string | null = null;
    let rawError: string | null = null;
    let httpStatus: number | null = null;
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: prompt }]
        })
      });
      httpStatus = response.status;
      if (!response.ok) {
        rawError = `HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`;
      } else {
        const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
        rawText = json.content.find((b) => b.type === "text")?.text ?? "(no text block)";
      }
    } catch (e) {
      rawError = e instanceof Error ? e.message : String(e);
    }

    // Also run the regular chat handler so we can see what the user-facing
    // reply *would* be after schema parse + normalization.
    let normalized: unknown = null;
    let normalizeError: string | null = null;
    try {
      normalized = await runCreatorChat(
        parsed.messages,
        parsed.step,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed.confirmedInputs as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed.storyline as any,
        parsed.targetTool,
        parsed.inputContext ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed.outline as any
      );
    } catch (e) {
      normalizeError = e instanceof Error ? e.message : String(e);
    }

    res.status(200).json({
      ok: true,
      model,
      httpStatus,
      rawText,
      rawError,
      normalized,
      normalizeError,
      systemPromptLength: system.length,
      userPromptLength: prompt.length,
      // System/user prompts are too big to dump fully; show heads/tails so
      // you can confirm context is being passed.
      systemPromptHead: system.slice(0, 800),
      systemPromptTail: system.slice(-800),
      userPrompt: prompt.length <= 4000 ? prompt : `${prompt.slice(0, 2000)}\n…[${prompt.length - 4000} chars omitted]…\n${prompt.slice(-2000)}`,
      requestSummary: {
        step: parsed.step,
        targetTool: parsed.targetTool,
        messageCount: parsed.messages.length,
        lastUserMessage: parsed.messages[parsed.messages.length - 1]?.content?.slice(0, 200) ?? null,
        hasConfirmedInputs: Boolean(parsed.confirmedInputs),
        storylineLen: Array.isArray(parsed.storyline) ? parsed.storyline.length : 0,
        outlineLen: Array.isArray(parsed.outline) ? parsed.outline.length : 0
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Debug failed."
    });
  }
}
