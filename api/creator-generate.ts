import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorGenerate } from "../modules/creator/generate.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{
    extractedInputs: Parameters<typeof runCreatorGenerate>[0]["extractedInputs"];
    sectionMap?: Parameters<typeof runCreatorGenerate>[0]["sectionMapProposal"];
    sectionMapProposal?: Parameters<typeof runCreatorGenerate>[0]["sectionMapProposal"];
    tone?: string;
    artifactsUsed?: Parameters<typeof runCreatorGenerate>[0]["artifactsUsed"];
  }>(req);
  const result = await runCreatorGenerate({
    extractedInputs: payload.extractedInputs,
    sectionMapProposal: payload.sectionMap ?? payload.sectionMapProposal!,
    tone: payload.tone,
    artifactsUsed: payload.artifactsUsed
  });
  res.status(200).json(result);
}
