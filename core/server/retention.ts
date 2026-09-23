import { del, list } from "@vercel/blob";

import { prisma } from "./prisma.js";

// Data retention for Deckspert-hosted content.
//
// Two things have to go for a deletion to be real: the database rows and the
// Vercel Blob objects. Dropping only the rows leaves the uploaded deck or
// recording sitting in the blob store at a URL that still resolves, which is
// exactly the gap this module exists to close.
//
// Child rows (DerivedAsset, TranscriptSegment, CoachingReport,
// ProcessingEvent) cascade from DeliveryJob in schema.prisma, so the row half
// is handled by deleting the parent. Blobs have no such cascade — they are not
// in the database at all — so they are collected and deleted explicitly.

export const DEFAULT_RETENTION_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Deleting blobs one at a time keeps a single bad object from abandoning the
// rest of the run, but a purge can span hundreds of frames, so run a few at a
// time rather than strictly serially.
const BLOB_DELETE_CONCURRENCY = 8;

export function getRetentionDays(): number {
  const raw = process.env.DATA_RETENTION_DAYS;
  if (!raw) {
    return DEFAULT_RETENTION_DAYS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[Retention] Ignoring invalid DATA_RETENTION_DAYS="${raw}"; falling back to ${DEFAULT_RETENTION_DAYS} days.`
    );
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.floor(parsed);
}

export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - getRetentionDays() * MS_PER_DAY);
}

export type BlobDeletionSummary = {
  requested: number;
  deleted: number;
  failed: number;
};

function emptyBlobSummary(): BlobDeletionSummary {
  return { requested: 0, deleted: 0, failed: 0 };
}

/**
 * Deletes blob objects by URL, tolerating ones that are already gone.
 *
 * `del()` is idempotent — deleting a URL that no longer exists resolves rather
 * than throwing — but a store outage, a revoked token or a malformed URL still
 * can throw, and none of those should cost us the rest of the purge. Failures
 * are counted and logged so a run that couldn't finish is visible, and the
 * surviving database row means the next run will try the same blob again.
 */
export async function deleteBlobs(
  urls: Array<string | null | undefined>
): Promise<BlobDeletionSummary> {
  const unique = Array.from(
    new Set(urls.filter((url): url is string => typeof url === "string" && url.length > 0))
  );

  const summary: BlobDeletionSummary = { requested: unique.length, deleted: 0, failed: 0 };

  for (let index = 0; index < unique.length; index += BLOB_DELETE_CONCURRENCY) {
    const batch = unique.slice(index, index + BLOB_DELETE_CONCURRENCY);
    await Promise.all(
      batch.map(async (url) => {
        try {
          await del(url);
          summary.deleted += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(
            `[Retention] Could not delete blob ${url}:`,
            error instanceof Error ? error.message : error
          );
        }
      })
    );
  }

  return summary;
}

export type JobDeletionResult = {
  deliveryJobs: number;
  blobs: BlobDeletionSummary;
};

/**
 * Deletes delivery jobs and every blob they own.
 *
 * Ownership is NOT checked here — the scheduled purge deliberately deletes
 * across all users. Callers acting on behalf of a signed-in person must
 * confirm the job belongs to them first.
 */
export async function deleteDeliveryJobs(jobIds: string[]): Promise<JobDeletionResult> {
  if (!jobIds.length) {
    return { deliveryJobs: 0, blobs: emptyBlobSummary() };
  }

  const jobs = await prisma.deliveryJob.findMany({
    where: { id: { in: jobIds } },
    select: {
      id: true,
      originalBlobUrl: true,
      analysisBlobUrl: true,
      audioBlobUrl: true,
      derivedAssets: { select: { blobUrl: true } }
    }
  });

  if (!jobs.length) {
    return { deliveryJobs: 0, blobs: emptyBlobSummary() };
  }

  const urls = jobs.flatMap((job) => [
    job.originalBlobUrl,
    job.analysisBlobUrl,
    job.audioBlobUrl,
    ...job.derivedAssets.map((asset) => asset.blobUrl)
  ]);

  // Blobs before rows, deliberately. If this dies half way the rows survive,
  // so the next run still knows which blobs to chase. Deleting the rows first
  // would strand every remaining blob with nothing pointing at it.
  const blobs = await deleteBlobs(urls);

  const deleted = await prisma.deliveryJob.deleteMany({
    where: { id: { in: jobs.map((job) => job.id) } }
  });

  return { deliveryJobs: deleted.count, blobs };
}

export type UserDeletionResult = JobDeletionResult & {
  evaluatorReports: number;
  creatorProjects: number;
  coachThreads: number;
};

/** Deletes everything Deckspert holds for one user. */
export async function deleteAllDataForUser(userId: string): Promise<UserDeletionResult> {
  const jobs = await prisma.deliveryJob.findMany({
    where: { userId },
    select: { id: true }
  });

  const jobResult = await deleteDeliveryJobs(jobs.map((job) => job.id));

  // CoachMessage cascades from CoachThread, so deleting the thread is enough.
  const [evaluatorReports, creatorProjects, coachThreads] = await prisma.$transaction([
    prisma.evaluatorReport.deleteMany({ where: { userId } }),
    prisma.creatorProject.deleteMany({ where: { userId } }),
    prisma.coachThread.deleteMany({ where: { userId } })
  ]);

  return {
    ...jobResult,
    evaluatorReports: evaluatorReports.count,
    creatorProjects: creatorProjects.count,
    coachThreads: coachThreads.count
  };
}

/** Every blob URL still pointed at by a surviving row. */
async function collectReferencedBlobUrls(): Promise<Set<string>> {
  const [jobs, assets] = await Promise.all([
    prisma.deliveryJob.findMany({
      select: { originalBlobUrl: true, analysisBlobUrl: true, audioBlobUrl: true }
    }),
    prisma.derivedAsset.findMany({ select: { blobUrl: true } })
  ]);

  const referenced = new Set<string>();

  for (const job of jobs) {
    if (job.originalBlobUrl) referenced.add(job.originalBlobUrl);
    if (job.analysisBlobUrl) referenced.add(job.analysisBlobUrl);
    if (job.audioBlobUrl) referenced.add(job.audioBlobUrl);
  }

  for (const asset of assets) {
    referenced.add(asset.blobUrl);
  }

  return referenced;
}

/**
 * Deletes expired blobs that no surviving row points at.
 *
 * Evaluator and Creator uploads reach the blob store through
 * /api/upload-token, but their URL only ever travels through a request body —
 * it is never written to the database. Nothing records who uploaded one or
 * which report it belongs to, so no row-driven delete can reach them and age
 * is the only handle we have. Without this sweep every deck uploaded for a
 * StoryCheck would stay in the store forever.
 *
 * Anything still referenced by a surviving row is skipped, so this cannot pull
 * a blob out from under a delivery job that is inside its retention window.
 */
export async function purgeExpiredOrphanBlobs(cutoff: Date): Promise<BlobDeletionSummary> {
  const referenced = await collectReferencedBlobUrls();

  const stale: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (blob.uploadedAt < cutoff && !referenced.has(blob.url)) {
        stale.push(blob.url);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return deleteBlobs(stale);
}

export type PurgeResult = UserDeletionResult & {
  retentionDays: number;
  cutoff: string;
  orphanBlobs: BlobDeletionSummary;
};

/**
 * The scheduled sweep: drops everything past the retention window, across all
 * users, then clears expired blobs that nothing points at any more.
 */
export async function purgeExpiredData(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now);

  const expiredJobs = await prisma.deliveryJob.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true }
  });

  const jobResult = await deleteDeliveryJobs(expiredJobs.map((job) => job.id));

  const [evaluatorReports, creatorProjects, coachThreads] = await prisma.$transaction([
    prisma.evaluatorReport.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
    prisma.creatorProject.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
    prisma.coachThread.deleteMany({ where: { updatedAt: { lt: cutoff } } })
  ]);

  // After the row deletions, so blobs belonging to jobs this run just removed
  // are not mistaken for live references.
  const orphanBlobs = await purgeExpiredOrphanBlobs(cutoff);

  return {
    ...jobResult,
    evaluatorReports: evaluatorReports.count,
    creatorProjects: creatorProjects.count,
    coachThreads: coachThreads.count,
    retentionDays: getRetentionDays(),
    cutoff: cutoff.toISOString(),
    orphanBlobs
  };
}
