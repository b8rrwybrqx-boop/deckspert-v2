import { getEvaluatorReportForUser } from "../core/server/workspace.js";
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

  const payload = readJsonBody<{ action?: "get"; reportId?: string }>(req);

  if (payload.action === "get") {
    if (!payload.reportId) {
      res.status(400).json({ error: "Report ID is required." });
      return;
    }

    const report = await getEvaluatorReportForUser(user, payload.reportId);
    if (!report) {
      res.status(404).json({ error: "Evaluation report not found." });
      return;
    }

    res.status(200).json({
      report: {
        id: report.id,
        filename: report.filename,
        mode: report.mode,
        phase1Markdown: report.phase1Markdown,
        phase2Markdown: report.phase2Markdown,
        resultJson: report.resultJson,
        updatedAt: report.updatedAt.toISOString()
      }
    });
    return;
  }

  res.status(400).json({ error: "Unknown evaluator report action." });
}
