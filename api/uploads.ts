import { createArtifacts } from "../core/artifacts/upload";
import { processArtifacts } from "../core/artifacts/extract";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const payload = readJsonBody<{ artifacts: unknown[] }>(req);
  const artifacts = processArtifacts(createArtifacts(payload.artifacts ?? []));
  res.status(200).json({ artifacts });
}
