export const maxDuration = 300;

import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runPrepEvaluator } from "../modules/evaluator/prepEvaluator.js";

// Premium (authenticated) Proper Prep evaluator. Reuses the same evaluator module
// as the session tool (api/session-prep-evaluator.ts) but gates on a logged-in user
// instead of a session passcode, and skips the session result-email path.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  try {
    const payload = readJsonBody<{ title?: string; notes?: string; artifacts?: unknown[] }>(req);
    const result = await runPrepEvaluator(payload);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Proper Prep evaluation failed." });
  }
}
