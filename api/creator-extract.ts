import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runCreatorExtract } from "../modules/creator/extract.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{
    notes?: string;
    inputType?: string;
    meetingLengthMinutes?: number;
    minutesPerSlide?: number;
    artifacts?: unknown[];
  }>(req);
  const result = await runCreatorExtract(payload);
  res.status(200).json(result);
}
