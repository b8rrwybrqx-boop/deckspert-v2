import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorStoryline } from "../modules/creator/storyline.js";
import { extractedInputsSchema } from "../core/schemas/story.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  try {
    const payload = readJsonBody<{ extractedInputs: unknown }>(req);
    const inputs = extractedInputsSchema.parse(payload.extractedInputs);
    const result = await runCreatorStoryline(inputs);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Storyline generation failed."
    });
  }
}
