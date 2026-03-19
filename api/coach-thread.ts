import { getCoachThreadForUser, upsertCoachThreadForUser } from "../core/server/workspace.js";
import { requireAuthenticatedUser } from "./auth.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

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
    threadId?: string;
    thread?: {
      id: string;
      title: string;
      messages: Array<{
        role: string;
        text: string;
        diagnosis?: unknown;
        reframes?: unknown[];
        doctrineHighlights?: unknown[];
        suggestions?: string[];
        nextStep?: string;
      }>;
    };
  }>(req);

  if (payload.action === "get") {
    if (!payload.threadId) {
      res.status(400).json({ error: "Thread ID is required." });
      return;
    }

    const thread = await getCoachThreadForUser(user.id, payload.threadId);
    if (!thread) {
      res.status(404).json({ error: "Coach thread not found." });
      return;
    }

    res.status(200).json({ thread });
    return;
  }

  if (payload.action === "upsert") {
    if (!payload.thread) {
      res.status(400).json({ error: "Thread payload is required." });
      return;
    }

    const thread = await upsertCoachThreadForUser({
      user,
      threadId: payload.thread.id,
      title: payload.thread.title,
      messages: payload.thread.messages.map((message) => ({
        role: message.role,
        text: message.text,
        diagnosisJson: message.diagnosis,
        reframesJson: message.reframes,
        doctrineHighlightsJson: message.doctrineHighlights,
        suggestionsJson: message.suggestions,
        nextStep: message.nextStep ?? null
      }))
    });

    res.status(200).json({ thread });
    return;
  }

  res.status(400).json({ error: "Unknown coach thread action." });
}
