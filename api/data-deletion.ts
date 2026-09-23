import { prisma } from "../core/server/prisma.js";
import { deleteAllDataForUser, deleteDeliveryJobs } from "../core/server/retention.js";
import { requireAuthenticatedUser } from "./auth.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

// On-demand deletion of Deckspert-hosted content.
//
// POST { scope: "all" }              → everything this user has
// POST { scope: "job", jobId: "…" }  → one delivery review and its blobs
//
// Both paths delete the Vercel Blob objects as well as the database rows; see
// core/server/retention.ts for why that ordering matters.

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const body = readJsonBody<{ scope?: unknown; jobId?: unknown; dryRun?: unknown }>(req);
  const scope = typeof body.scope === "string" ? body.scope : "all";
  // `{ "dryRun": true }` reports what would go without deleting it, so a
  // deletion request can be previewed before it's actioned.
  const dryRun = body.dryRun === true;

  if (scope === "job") {
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required when scope is "job".' });
      return;
    }

    // Ownership is enforced here rather than inside deleteDeliveryJobs,
    // because that helper is also the scheduled purge's path and the purge is
    // deliberately not user-scoped.
    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { userId: true }
    });

    // Same answer whether the job never existed or belongs to someone else,
    // so this can't be used to probe for other people's job ids.
    if (!job || !job.userId || job.userId !== user.id) {
      res.status(404).json({ error: "No such delivery review." });
      return;
    }

    const result = await deleteDeliveryJobs([jobId], { dryRun });
    res.status(200).json({ ok: true, scope: "job", dryRun, ...result });
    return;
  }

  if (scope !== "all") {
    res.status(400).json({ error: 'scope must be "all" or "job".' });
    return;
  }

  const result = await deleteAllDataForUser(user.id, { dryRun });
  res.status(200).json({ ok: true, scope: "all", dryRun, ...result });
}
