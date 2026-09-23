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
//
// The orphan sweep decides what to delete by asking the database what is still
// referenced, which makes it only as safe as the database it is pointed at.
// Run it against the wrong one and every object in the store looks like an
// orphan. Three things guard that: it is off unless explicitly enabled, it
// refuses to run when the reference set looks implausible for the store it is
// looking at, and it supports a dry run that reports without deleting.

export const DEFAULT_RETENTION_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Deleting blobs one at a time keeps a single bad object from abandoning the
// rest of the run, but a purge can span hundreds of frames, so run a few at a
// time rather than strictly serially.
const BLOB_DELETE_CONCURRENCY = 8;

// A sweep that would clear more than this share of the store is treated as a
// misconfiguration rather than a big backlog.
const DEFAULT_MAX_SWEEP_FRACTION = 0.5;

export type RetentionOptions = {
  /** Report what would be deleted without deleting anything. */
  dryRun?: boolean;
};

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

/** The orphan sweep is opt-in; the row purge runs without it. */
export function isOrphanSweepEnabled(): boolean {
  return process.env.RETENTION_SWEEP_ORPHANS === "1";
}

export function getMaxSweepFraction(): number {
  const raw = process.env.RETENTION_MAX_SWEEP_FRACTION;
  if (!raw) {
    return DEFAULT_MAX_SWEEP_FRACTION;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    console.warn(
      `[Retention] Ignoring invalid RETENTION_MAX_SWEEP_FRACTION="${raw}"; falling back to ${DEFAULT_MAX_SWEEP_FRACTION}.`
    );
    return DEFAULT_MAX_SWEEP_FRACTION;
  }

  return parsed;
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
  urls: Array<string | null | undefined>,
  options: RetentionOptions = {}
): Promise<BlobDeletionSummary> {
  const unique = Array.from(
    new Set(urls.filter((url): url is string => typeof url === "string" && url.length > 0))
  );

  const summary: BlobDeletionSummary = { requested: unique.length, deleted: 0, failed: 0 };

  if (options.dryRun) {
    return summary;
  }

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
export async function deleteDeliveryJobs(
  jobIds: string[],
  options: RetentionOptions = {}
): Promise<JobDeletionResult> {
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
  const blobs = await deleteBlobs(urls, options);

  if (options.dryRun) {
    return { deliveryJobs: jobs.length, blobs };
  }

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
export async function deleteAllDataForUser(
  userId: string,
  options: RetentionOptions = {}
): Promise<UserDeletionResult> {
  const jobs = await prisma.deliveryJob.findMany({
    where: { userId },
    select: { id: true }
  });

  const jobResult = await deleteDeliveryJobs(jobs.map((job) => job.id), options);

  // CoachMessage cascades from CoachThread, so deleting the thread is enough.
  const where = { userId };
  const [evaluatorReports, creatorProjects, coachThreads] = options.dryRun
    ? await prisma.$transaction([
        prisma.evaluatorReport.count({ where }),
        prisma.creatorProject.count({ where }),
        prisma.coachThread.count({ where })
      ])
    : (
        await prisma.$transaction([
          prisma.evaluatorReport.deleteMany({ where }),
          prisma.creatorProject.deleteMany({ where }),
          prisma.coachThread.deleteMany({ where })
        ])
      ).map((result) => result.count);

  return {
    ...jobResult,
    evaluatorReports,
    creatorProjects,
    coachThreads
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

export type SweepPlausibility = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether a proposed sweep looks like retention or like a mistake.
 *
 * This is the guard that a real incident turned up: pointing the sweep at a
 * database that isn't the one the store belongs to makes every object in the
 * store look unreferenced, and the sweep will happily clear it. Both checks
 * below key on that shape rather than on any particular cause.
 *
 * Pure and exported so it can be tested without a store or a database.
 */
export function assessSweepPlausibility(input: {
  scanned: number;
  candidates: number;
  referenced: number;
  maxFraction: number;
}): SweepPlausibility {
  const { scanned, candidates, referenced, maxFraction } = input;

  if (scanned === 0 || candidates === 0) {
    return { ok: true };
  }

  // A store with objects in it and a database that references none of them is
  // not a backlog, it is the wrong database.
  if (referenced === 0) {
    return {
      ok: false,
      reason: `refusing to sweep: the store holds ${scanned} objects but the database references none of them, which usually means it is not the database this store belongs to`
    };
  }

  const fraction = candidates / scanned;
  if (fraction > maxFraction) {
    return {
      ok: false,
      reason: `refusing to sweep: ${candidates} of ${scanned} objects (${Math.round(
        fraction * 100
      )}%) look unreferenced, above the ${Math.round(maxFraction * 100)}% ceiling`
    };
  }

  return { ok: true };
}

export type OrphanSweepResult = {
  enabled: boolean;
  skipped: boolean;
  reason?: string;
  scanned: number;
  candidates: number;
  referenced: number;
  blobs: BlobDeletionSummary;
};

/**
 * Deletes expired blobs that no surviving row points at.
 *
 * Uploads from the evaluator and Creator reach the blob store through
 * /api/upload-token, but their URL only ever travels through a request body —
 * it is never written to the database. Nothing records who uploaded one or
 * which report it belongs to, so no row-driven delete can reach them and age
 * is the only handle we have.
 *
 * Off unless RETENTION_SWEEP_ORPHANS=1, and refuses outright when the
 * reference set doesn't look plausible for the store in front of it.
 */
export async function purgeExpiredOrphanBlobs(
  cutoff: Date,
  options: RetentionOptions = {}
): Promise<OrphanSweepResult> {
  const enabled = isOrphanSweepEnabled();
  const base: OrphanSweepResult = {
    enabled,
    skipped: true,
    scanned: 0,
    candidates: 0,
    referenced: 0,
    blobs: emptyBlobSummary()
  };

  if (!enabled) {
    return { ...base, reason: "orphan sweep is disabled (set RETENTION_SWEEP_ORPHANS=1 to enable)" };
  }

  const referenced = await collectReferencedBlobUrls();

  const stale: string[] = [];
  let scanned = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ cursor, limit: 1000 });
    for (const blob of page.blobs) {
      scanned += 1;
      if (blob.uploadedAt < cutoff && !referenced.has(blob.url)) {
        stale.push(blob.url);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const verdict = assessSweepPlausibility({
    scanned,
    candidates: stale.length,
    referenced: referenced.size,
    maxFraction: getMaxSweepFraction()
  });

  if (!verdict.ok) {
    console.error(`[Retention] ${verdict.reason}`);
    return {
      ...base,
      scanned,
      candidates: stale.length,
      referenced: referenced.size,
      reason: verdict.reason
    };
  }

  return {
    enabled,
    skipped: false,
    scanned,
    candidates: stale.length,
    referenced: referenced.size,
    blobs: await deleteBlobs(stale, options)
  };
}

export type PurgeResult = UserDeletionResult & {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  orphanSweep: OrphanSweepResult;
};

/**
 * The scheduled sweep: drops everything past the retention window, across all
 * users, then clears expired blobs that nothing points at any more.
 */
export async function purgeExpiredData(
  options: RetentionOptions & { now?: Date } = {}
): Promise<PurgeResult> {
  const dryRun = options.dryRun === true;
  const cutoff = retentionCutoff(options.now ?? new Date());
  const expired = { updatedAt: { lt: cutoff } };

  const expiredJobs = await prisma.deliveryJob.findMany({
    where: expired,
    select: { id: true }
  });

  const jobResult = await deleteDeliveryJobs(expiredJobs.map((job) => job.id), { dryRun });

  const [evaluatorReports, creatorProjects, coachThreads] = dryRun
    ? await prisma.$transaction([
        prisma.evaluatorReport.count({ where: expired }),
        prisma.creatorProject.count({ where: expired }),
        prisma.coachThread.count({ where: expired })
      ])
    : (
        await prisma.$transaction([
          prisma.evaluatorReport.deleteMany({ where: expired }),
          prisma.creatorProject.deleteMany({ where: expired }),
          prisma.coachThread.deleteMany({ where: expired })
        ])
      ).map((result) => result.count);

  // After the row deletions, so blobs belonging to jobs this run just removed
  // are not mistaken for live references.
  const orphanSweep = await purgeExpiredOrphanBlobs(cutoff, { dryRun });

  return {
    ...jobResult,
    evaluatorReports,
    creatorProjects,
    coachThreads,
    dryRun,
    retentionDays: getRetentionDays(),
    cutoff: cutoff.toISOString(),
    orphanSweep
  };
}
