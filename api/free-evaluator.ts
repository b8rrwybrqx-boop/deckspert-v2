import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { runFreeEvaluator } from "../modules/evaluator/freeEvaluator.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  try {
    const payload = readJsonBody<unknown>(req);
    const result = await runFreeEvaluator(payload);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Free evaluation failed."
    });
  }
}
