# Data retention and deletion

Deckspert-hosted content and derived outputs are retained only for the duration
of the engagement, and are deleted on request or at engagement close.

## Retention window

Content is deleted automatically once it is older than `DATA_RETENTION_DAYS`
(default **90 days**). The window is measured against each record's `updatedAt`,
so material that is still being worked on is not swept up mid-engagement.

An unset, zero, negative or non-numeric `DATA_RETENTION_DAYS` falls back to the
90-day default and logs a warning rather than disabling retention.

## What gets deleted

Both halves go, together — the database rows **and** the stored files in Vercel
Blob. Dropping only the rows would leave an uploaded deck or recording at a URL
that still resolves.

| Content | Rows | Stored files |
|---|---|---|
| Delivery review | `DeliveryJob`, and by cascade `DerivedAsset`, `TranscriptSegment`, `CoachingReport`, `ProcessingEvent` | `originalBlobUrl`, `analysisBlobUrl`, `audioBlobUrl`, every `DerivedAsset.blobUrl` (audio, frames) |
| StoryCheck report | `EvaluatorReport` | uploaded original, via the orphan sweep below |
| Creator project | `CreatorProject` | uploaded source material, via the orphan sweep below |
| Coach conversation | `CoachThread`, and by cascade `CoachMessage` | none |

### The orphan sweep

Uploads from the evaluator and Creator reach Vercel Blob through
`/api/upload-token`, but their URL only ever travels through a request body — it
is never written to the database. Nothing records who uploaded one or which
report it belongs to, so no row-driven delete can reach them, and age is the
only handle available.

The scheduled purge can therefore also list the blob store directly and delete
anything past the retention window that no surviving row points at. Blobs still
referenced by a live delivery job are skipped, so the sweep cannot remove a file
belonging to work that is inside its window.

**The sweep is off unless `RETENTION_SWEEP_ORPHANS=1`.** It decides what to
delete by asking the database what is still referenced, which makes it only as
safe as the database it is pointed at. Point it at one that isn't the store's
own — a local copy, a restored snapshot, a branch — and every object in the
store looks like an orphan.

Two things guard that beyond the opt-in:

- It refuses to run when the store holds objects and the database references
  **none** of them, which is the signature of the wrong database.
- It refuses when the objects it would delete exceed `RETENTION_MAX_SWEEP_FRACTION`
  of the store (default `0.5`). A genuine backlog above that ceiling needs the
  variable raised deliberately for that run.

A refusal is reported in the response as `orphanSweep.skipped` with a reason,
and logged at error level. The row purge still runs.

### Dry run

Both endpoints accept a dry run, which reports exactly what would be removed
and deletes nothing:

```
GET  /api/retention-purge?dryRun=1
POST /api/retention-purge      { "dryRun": true }
POST /api/data-deletion        { "scope": "all", "dryRun": true }
```

Run this first against any environment whose contents you are not certain of.
In a dry run `blobs.requested` is what *would* go and `blobs.deleted` stays at
zero.

## The two deletion paths

**On request — `POST /api/data-deletion`.** Requires an authenticated session
and acts only on the caller's own content.

```jsonc
{ "scope": "all" }                    // everything this user has
{ "scope": "job", "jobId": "…" }      // one delivery review and its files
```

A job belonging to someone else returns the same `404` as one that never
existed, so the endpoint cannot be used to probe for other people's job ids.

**On schedule — `GET /api/retention-purge`.** Runs daily at 03:00 UTC via the
Vercel Cron entry in `vercel.json`, and deletes across all users. It is
protected by `CRON_SECRET`, sent as `Authorization: Bearer $CRON_SECRET`.

If `CRON_SECRET` is unset the endpoint refuses every request in production
rather than leaving a delete-everything route open. **This means the purge does
not run until the secret is set.** It stays reachable without a secret outside
production so the sweep can be exercised locally.

It also accepts `POST`, so an engagement close can be actioned immediately
rather than waiting for the next scheduled run.

## Resilience

A file that is already gone does not fail the run. Deletions are issued per
object and a failure is counted and logged rather than thrown, so one bad or
missing object cannot abandon the rest of the purge. Because files are deleted
*before* their rows, a run that dies half way leaves the rows in place and the
next run retries the same files — the alternative ordering would strand them
with nothing pointing at them.

## Operating notes

- `DATA_RETENTION_DAYS` — retention window in days. Optional; defaults to 90.
- `CRON_SECRET` — required in production, or the scheduled purge will not run.
- `RETENTION_SWEEP_ORPHANS` — set to exactly `1` to enable the orphan blob
  sweep. Off by default, so row-driven deletion runs without it.
- `RETENTION_MAX_SWEEP_FRACTION` — ceiling on the share of the store one sweep
  may clear, between 0 and 1. Optional; defaults to `0.5`.
- Changing either variable in Vercel requires a redeploy to take effect;
  functions read the env snapshot captured at deploy time.
- Implementation lives in `core/server/retention.ts`.
