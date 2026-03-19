import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCoach } from "../modules/coach/coachEngine.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{ messages: Array<{ role: "user" | "assistant" | "system"; content: string }> }>(req);
  const result = await runCoach(payload.messages ?? []);
  res.status(200).json(result);
}
