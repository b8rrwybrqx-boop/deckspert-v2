import { createArtifacts } from "../core/artifacts/upload.js";
import { processArtifacts } from "../core/artifacts/extract.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const payload = readJsonBody<{ artifacts: unknown[] }>(req);
  const artifacts = await processArtifacts(createArtifacts(payload.artifacts ?? []));
  res.status(200).json({ artifacts });
}
