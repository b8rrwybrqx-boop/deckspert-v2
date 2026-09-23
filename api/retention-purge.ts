import { timingSafeEqual } from "node:crypto";

import { purgeExpiredData } from "../core/server/retention.js";
import { readHeader, readParam, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

// Scheduled retention sweep. Wired to a daily Vercel Cron in vercel.json,
// which calls it with `Authorization: Bearer $CRON_SECRET`.
//
// This endpoint deletes other people's data across the whole store, so it is
// gated on the shared secret rather than on a user session.

function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // timingSafeEqual throws on a length mismatch, so that has to be checked
  // first; the length of a bearer token isn't the secret.
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function isProduction(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv === "production";
  }
  return process.env.NODE_ENV === "production";
}

function isAuthorized(req: ApiRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Fail closed in production: an unset secret must not leave a
    // delete-everything endpoint open to the internet. Locally it stays
    // reachable so the sweep can be exercised without extra setup.
    return !isProduction();
  }

  const authorization = readHeader(req, "authorization");
  return typeof authorization === "string" && constantTimeEquals(authorization, `Bearer ${secret}`);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Vercel Cron issues a GET; POST is accepted so the sweep can be triggered
  // by hand during an engagement close without waiting for the schedule.
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  // `?dryRun=1`, or `{ "dryRun": true }` on a POST: report what would go
  // without deleting anything. Worth running first against any environment
  // whose contents you aren't certain of.
  const body = req.method === "POST" ? readJsonBody<{ dryRun?: unknown }>(req) : {};
  const dryRun = readParam(req, "dryRun") === "1" || body.dryRun === true;

  try {
    const result = await purgeExpiredData({ dryRun });
    const sweep = result.orphanSweep;
    console.log(
      `[Retention] ${dryRun ? "Dry run" : "Purge"} complete. Window ${result.retentionDays}d ` +
        `(cutoff ${result.cutoff}). Jobs ${result.deliveryJobs}, reports ${result.evaluatorReports}, ` +
        `projects ${result.creatorProjects}, threads ${result.coachThreads}, ` +
        `job blobs ${result.blobs.deleted}/${result.blobs.requested} (${result.blobs.failed} failed). ` +
        `Orphan sweep: ${
          sweep.skipped
            ? `skipped — ${sweep.reason}`
            : `${sweep.blobs.deleted}/${sweep.blobs.requested} of ${sweep.scanned} scanned`
        }.`
    );
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[Retention] Purge failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Retention purge failed."
    });
  }
}
