import { getCreatorProjectForUser, upsertCreatorProjectForUser } from "../apps/delivery-coach/lib/db/workspace";
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

  const payload = readJsonBody<{
    action?: "get" | "upsert";
    projectId?: string;
    project?: {
      id: string;
      title: string;
      inputType: string;
      sourceNotes: string;
      extractedInputsJson?: unknown;
      sectionMapJson?: unknown;
      storyboardJson?: unknown;
      status: string;
    };
  }>(req);

  if (payload.action === "get") {
    if (!payload.projectId) {
      res.status(400).json({ error: "Project ID is required." });
      return;
    }

    const project = await getCreatorProjectForUser(user.id, payload.projectId);
    if (!project) {
      res.status(404).json({ error: "Creator project not found." });
      return;
    }

    res.status(200).json({ project });
    return;
  }

  if (payload.action === "upsert") {
    if (!payload.project) {
      res.status(400).json({ error: "Project payload is required." });
      return;
    }

    const project = await upsertCreatorProjectForUser({
      user,
      projectId: payload.project.id,
      title: payload.project.title,
      inputType: payload.project.inputType,
      sourceNotes: payload.project.sourceNotes,
      extractedInputsJson: payload.project.extractedInputsJson,
      sectionMapJson: payload.project.sectionMapJson,
      storyboardJson: payload.project.storyboardJson,
      status: payload.project.status
    });

    res.status(200).json({ project });
    return;
  }

  res.status(400).json({ error: "Unknown creator project action." });
}
