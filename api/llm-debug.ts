import { getLastLlmDiagnostics } from "../core/llm/client.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./_utils.js";
import { ensureMethod } from "./_utils.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "GET")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  res.status(200).json({
    diagnostics: getLastLlmDiagnostics()
  });
}
