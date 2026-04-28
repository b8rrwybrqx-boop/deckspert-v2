import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorChat } from "../modules/creator/chat.js";
import { extractedInputsSchema, storylineSectionSchema } from "../core/schemas/story.js";
import { z } from "zod";

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })).min(1).max(20),
  step: z.string(),
  confirmedInputs: extractedInputsSchema.optional().nullable(),
  storyline: z.array(storylineSectionSchema).optional().nullable(),
  targetTool: z.string().optional()
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) return;
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  try {
    const payload = readJsonBody<unknown>(req);
    const { messages, step, confirmedInputs, storyline, targetTool } = chatRequestSchema.parse(payload);
    const result = await runCreatorChat(messages, step, confirmedInputs, storyline, targetTool);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Chat failed." });
  }
}
