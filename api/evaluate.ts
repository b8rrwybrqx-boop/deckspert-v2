import { createArtifacts } from "../core/artifacts/upload.js";
import { processArtifacts } from "../core/artifacts/extract.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { evaluateDelivery } from "../modules/evaluator/deliveryEvaluator.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const payload = readJsonBody<{
    videoName?: string;
    transcript?: string;
    notes?: string;
    artifacts?: unknown[];
  }>(req);
  const artifacts = processArtifacts(createArtifacts(payload.artifacts ?? []));
  const evaluation = await evaluateDelivery({
    videoName: payload.videoName,
    transcript: payload.transcript,
    notes: payload.notes,
    artifacts
  });

  res.status(200).json(evaluation);
}
