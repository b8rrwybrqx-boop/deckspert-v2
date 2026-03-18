import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils";
import { requireAuthenticatedUser } from "./auth";
import { runCreatorExtract } from "../modules/creator/extract";

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
