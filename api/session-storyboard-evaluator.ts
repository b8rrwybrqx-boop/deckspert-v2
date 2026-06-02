import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireSessionAccess } from "./_sessionGuard.js";
import { sendSessionResultEmail, logSessionUsage } from "./_sessionEmail.js";
import { runStoryboardEvaluator } from "../modules/evaluator/storyboardEvaluator.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  if (!requireSessionAccess(req)) {
    res.status(401).json({ error: "Your session access has expired. Re-enter your session code." });
    return;
  }

  try {
    const payload = readJsonBody<{ email?: string; title?: string; notes?: string; artifacts?: unknown[] }>(req);
    const email = typeof payload.email === "string" && payload.email.includes("@") ? payload.email : null;

    logSessionUsage("storyboard", email, { title: payload.title ?? null });

    const result = await runStoryboardEvaluator(payload);

    if (email) {
      try {
        await sendSessionResultEmail({
          email,
          toolName: "Storyboard",
          title: result.title,
          overallRead: result.overallRead,
          summary: result.executiveSummary,
          rows: result.sectionFeedback.map((s) => ({ label: s.label, status: s.status, score: s.score })),
          takeaways: result.topFixes
        });
      } catch (err) {
        console.warn("[Deckspert][Session][Storyboard] email send failed", err instanceof Error ? err.message : err);
      }
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Storyboard evaluation failed." });
  }
}
