import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorRevise } from "../modules/creator/revise.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{
    sectionMap: Parameters<typeof runCreatorRevise>[0]["sectionMap"];
    storyboard: Parameters<typeof runCreatorRevise>[0]["storyboard"];
    revisionRequest: Parameters<typeof runCreatorRevise>[0]["revisionRequest"];
  }>(req);
  const result = await runCreatorRevise(payload);
  res.status(200).json(result);
}
