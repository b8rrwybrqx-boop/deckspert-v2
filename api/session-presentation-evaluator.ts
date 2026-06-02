export const maxDuration = 300;

import { createArtifacts } from "../core/artifacts/upload.js";
import { processArtifacts } from "../core/artifacts/extract.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireSessionAccess } from "./_sessionGuard.js";
import { sendSessionResultEmail, logSessionUsage } from "./_sessionEmail.js";
import { runPlatformEvaluation } from "../modules/evaluator/platformEvaluator.js";

/** First non-empty, non-markup line as a short summary snippet. */
function extractSummaryText(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      return trimmed.slice(0, 200);
    }
  }
  return "Your full presentation evaluation is ready.";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  if (!requireSessionAccess(req)) {
    res.status(401).json({ error: "Your session access has expired. Re-enter your session code." });
    return;
  }

  const payload = readJsonBody<{
    artifacts?: unknown[];
    notes?: string;
    phase?: number;
    priorOutput?: string;
    email?: string;
    filename?: string;
  }>(req);

  try {
    const artifacts = await processArtifacts(createArtifacts(payload.artifacts ?? []));
    const phase = payload.phase === 2 ? 2 : 1;
    const email = typeof payload.email === "string" && payload.email.includes("@") ? payload.email : null;

    logSessionUsage("presentation", email, { phase, filename: payload.filename ?? null });

    const result = await runPlatformEvaluation({
      artifacts,
      notes: typeof payload.notes === "string" ? payload.notes : "",
      phase,
      priorOutput: typeof payload.priorOutput === "string" ? payload.priorOutput : undefined
    });

    // Email only on the first phase so attendees aren't double-emailed.
    if (email && phase === 1) {
      try {
        await sendSessionResultEmail({
          email,
          toolName: "Presentation",
          title: typeof payload.filename === "string" ? payload.filename : null,
          overallRead: "mixed",
          summary: extractSummaryText(result.markdown)
        });
      } catch (err) {
        console.warn("[Deckspert][Session][Presentation] email send failed", err instanceof Error ? err.message : err);
      }
    }

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Presentation evaluation failed.";
    console.error("[Deckspert][Session][Presentation]", message);
    res.status(500).json({ error: message });
  }
}
