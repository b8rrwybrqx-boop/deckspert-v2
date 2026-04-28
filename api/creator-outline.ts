import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorOutline } from "../modules/creator/outline.js";
import { storylineSectionSchema } from "../core/schemas/story.js";
import { z } from "zod";

const outlineRequestSchema = z.object({
  storyline: z.array(storylineSectionSchema).min(7).max(7),
  targetTool: z.string().min(1),
  audienceRole: z.string().nullable().optional(),
  behavioralStyle: z.string().optional(),
  directive: z.string().optional()
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  try {
    const payload = readJsonBody<unknown>(req);
    const { storyline, targetTool, audienceRole, behavioralStyle, directive } = outlineRequestSchema.parse(payload);
    const result = await runCreatorOutline(
      storyline,
      targetTool,
      audienceRole ?? null,
      behavioralStyle ?? "unknown",
      directive
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Outline generation failed."
    });
  }
}
