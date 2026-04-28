import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorChat } from "../modules/creator/chat.js";
import { z } from "zod";

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })).min(1).max(20),
  step: z.string(),
  // Use passthrough/unknown for confirmedInputs and storyline — we only
  // forward these to the prompt builder, so strict schema validation
  // would reject valid payloads when optional enum fields differ.
  confirmedInputs: z.unknown().optional().nullable(),
  storyline: z.array(z.unknown()).optional().nullable(),
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
    const { messages, step, confirmedInputs, storyline, targetTool, inputContext } = chatRequestSchema.parse(payload);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runCreatorChat(messages, step, confirmedInputs as any, storyline as any, targetTool, inputContext ?? undefined);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Chat failed." });
  }
}
