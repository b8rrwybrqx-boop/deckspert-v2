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

The scheduled purge therefore also lists the blob store directly and deletes
anything past the retention window that no surviving row points at. Blobs still
referenced by a live delivery job are skipped, so the sweep cannot remove a file
belonging to work that is inside its window.

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
- Changing either variable in Vercel requires a redeploy to take effect;
  functions read the env snapshot captured at deploy time.
- Implementation lives in `core/server/retention.ts`.
