import { waitUntil } from "@vercel/functions";

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
 * Saves in the background so a database hiccup never fails an evaluation the
 * user already paid the wait for — but registered with waitUntil rather than
 * left floating.
 *
 * A bare fire-and-forget promise does not survive here: the handler responds
 * immediately after calling this, and the platform is free to freeze the
 * function once the response is sent. The write is then dropped mid-flight and
 * the .catch never runs, so it fails silently and looks like a 200 with no row.
 * waitUntil keeps the invocation alive until the promise settles without
 * blocking the response.
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
    // Was a silent return. A missing reportId and a dropped write look identical
    // from the outside — both are a 200 with nothing saved — so say which it is.
    console.error(`[Deckspert][${input.logTag}] No reportId on request; report not saved`);
    return;
  }

  // `filename` is non-nullable and these modes are paste-first, so there may be
  // no file at all. The user's own title is the best label; the model echoes a
  // title back when it can infer one, and the mode name is the last resort.
  const requestTitle = typeof input.requestTitle === "string" ? input.requestTitle.trim() : "";
  const filename = requestTitle || input.result.title?.trim() || input.defaultTitle;

  waitUntil(
    upsertEvaluatorReport({
      user: input.user,
      reportId,
      filename,
      mode: input.mode,
      resultJson: input.result,
      summaryText: (input.result.executiveSummary ?? "").slice(0, 160)
    }).catch((err: unknown) => {
      console.error(`[Deckspert][${input.logTag}] Failed to save report`, err);
    })
  );
}
