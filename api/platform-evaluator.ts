export const maxDuration = 300;

import { createArtifacts } from "../core/artifacts/upload.js";
import { processArtifacts } from "../core/artifacts/extract.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runPlatformEvaluation } from "../modules/evaluator/platformEvaluator.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{
    artifacts?: unknown[];
    notes?: string;
  }>(req);

  const artifacts = await processArtifacts(createArtifacts(payload.artifacts ?? []));
  const result = await runPlatformEvaluation({
    artifacts,
    notes: typeof payload.notes === "string" ? payload.notes : ""
  });

  res.status(200).json(result);
}
