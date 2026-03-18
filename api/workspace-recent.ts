import { listRecentWorkspaceItems } from "../apps/delivery-coach/lib/db/workspace";
import { requireAuthenticatedUser } from "./auth";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  readJsonBody(req);
  const items = await listRecentWorkspaceItems({
    id: user.id,
    email: user.email
  });
  res.status(200).json({ items });
}
