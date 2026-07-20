import { upsertEvaluatorReport } from "../core/server/workspace.js";
import type { WorkspaceUserIdentity } from "../core/server/workspace.js";

// Persistence for the two structured (paste-first) StoryChecks: Proper Prep and
// Storyboard. Unlike the deck evaluators these return an object rather than
// markdown, so the whole result lands in EvaluatorReport.resultJson and the page
// re-renders it directly on reopen.

type StructuredResultLike = {
  title?: string | null;
  executiveSummary?: string;
};

/**
 * Fire-and-forget save so a database hiccup never fails an evaluation the user
 * already paid the wait for. Mirrors the pattern in api/platform-evaluator.ts.
 */
export function saveStructuredReport(input: {
  user: WorkspaceUserIdentity;
  reportId: unknown;
  mode: "prep" | "storyboard";
  requestTitle: unknown;
  result: StructuredResultLike;
  defaultTitle: string;
  logTag: string;
}) {
  const reportId = typeof input.reportId === "string" ? input.reportId : null;
  if (!reportId) {
    return;
  }

  // `filename` is non-nullable and these modes are paste-first, so there may be
  // no file at all. The user's own title is the best label; the model echoes a
  // title back when it can infer one, and the mode name is the last resort.
  const requestTitle = typeof input.requestTitle === "string" ? input.requestTitle.trim() : "";
  const filename = requestTitle || input.result.title?.trim() || input.defaultTitle;

  upsertEvaluatorReport({
    user: input.user,
    reportId,
    filename,
    mode: input.mode,
    resultJson: input.result,
    summaryText: (input.result.executiveSummary ?? "").slice(0, 160)
  }).catch((err: unknown) => {
    console.error(`[Deckspert][${input.logTag}] Failed to save report`, err);
  });
}
