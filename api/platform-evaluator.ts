export const maxDuration = 300;

import { createArtifacts } from "../core/artifacts/upload.js";
import { processArtifacts } from "../core/artifacts/extract.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireAuthenticatedUser } from "./auth.js";
import { runPlatformEvaluation } from "../modules/evaluator/platformEvaluator.js";
import { upsertEvaluatorReport } from "../core/server/workspace.js";

/** Extract the first non-empty, non-heading line from markdown as a summary snippet. */
function extractSummaryText(markdown: string): string {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      return trimmed.slice(0, 160);
    }
  }
  return "";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const payload = readJsonBody<{
    artifacts?: unknown[];
    notes?: string;
    phase?: number;
    priorOutput?: string;
    reportId?: string;
    filename?: string;
  }>(req);

  try {
    const artifacts = await processArtifacts(createArtifacts(payload.artifacts ?? []));
    const phase = payload.phase === 2 ? 2 : 1;
    const result = await runPlatformEvaluation({
      artifacts,
      notes: typeof payload.notes === "string" ? payload.notes : "",
      phase,
      priorOutput: typeof payload.priorOutput === "string" ? payload.priorOutput : undefined
    });

    // Persist to Recent Work, fire-and-forget, don't block the response
    const reportId = typeof payload.reportId === "string" ? payload.reportId : null;
    const filename = typeof payload.filename === "string" ? payload.filename : "Evaluation";
    if (reportId) {
      const savePayload =
        phase === 1
          ? {
              user,
              reportId,
              filename,
              phase1Markdown: result.markdown,
              summaryText: extractSummaryText(result.markdown)
            }
          : {
              user,
              reportId,
              filename,
              phase2Markdown: result.markdown
            };
      upsertEvaluatorReport(savePayload).catch((err: unknown) => {
        console.error("[Deckspert][PlatformEvaluator] Failed to save report", err);
      });
    }

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Deckspert][PlatformEvaluator]", message);
    res.status(500).json({ error: message });
  }
}
