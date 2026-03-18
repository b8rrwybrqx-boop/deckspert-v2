# Deckspert Dynamic Delivery Coach MVP

This sub-app is the MVP for Deckspert pillar 3: Dynamic Delivery Feedback.

It is built as an isolated Next.js App Router app so it can ship without disturbing the existing Vite-based Creator and Coach work in the main repo.

## Architecture overview

The delivery MVP uses a simple, production-minded flow:

1. Browser uploads video directly to Vercel Blob using a signed upload token
2. Browser creates a `DeliveryJob` in Postgres
3. Browser triggers job processing
4. Processing pipeline downloads the source video, generates derived assets, transcribes audio, samples frames, and creates a structured coaching report
5. UI polls job status and renders the final report when complete

Core areas:

- `app/`: Next.js routes, pages, and API handlers
- `components/`: upload, status, and report UI
- `lib/blob/`: Blob upload helpers
- `lib/db/`: Prisma client and job persistence helpers
- `lib/ffmpeg/`: media metadata, transcode, audio extraction, chunking, frame sampling
- `lib/transcription/`: OpenAI transcription orchestration and merge logic
- `lib/visual/`: frame-level metadata and optional visual analysis
- `lib/coaching/`: delivery signal scoring and final coaching report generation
- `lib/jobs/`: queue trigger abstraction and end-to-end pipeline
- `lib/validation/`: request and JSON schema validation
- `prisma/`: data model

## Setup

1. Install dependencies:

```bash
cd apps/delivery-coach
npm install
```

2. Copy env template:

```bash
cp .env.example .env.local
```

3. Set:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `JOB_RUNNER_SECRET`
- `APP_BASE_URL`
- `OPENAI_API_KEY`
- optional `FFMPEG_PATH` / `FFPROBE_PATH`

4. Generate Prisma client and run a local migration:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start dev server:

```bash
npm run dev
```

## Upload flow

- Browser requests a short-lived upload token from `/api/upload-token`
- Browser uploads MP4/MOV directly to Vercel Blob
- Browser then creates a `DeliveryJob` with blob metadata

This keeps large uploads off the application server.

## Processing pipeline

Stages:

1. `uploaded`
2. `queued`
3. `compressing`
4. `extracting_audio`
5. `transcribing`
6. `sampling_frames`
7. `generating_coaching`
8. `complete`
9. `failed`

Pipeline steps:

- download original video from Blob
- transcode 720p analysis video
- extract mono speech-focused audio
- split audio into bounded chunks for transcription
- transcribe chunks with timestamps
- sample frames every N seconds
- derive visual metadata when possible
- generate structured coaching JSON

## Transcription chunking

OpenAI transcription uploads are size-limited, so the audio step:

- extracts a compressed mono track
- chunks by duration
- transcribes each chunk separately
- normalizes and merges the transcript into timestamped segments

If one chunk fails, the pipeline keeps partial transcript coverage and logs the failure.

## Known limitations

- body-language analysis is approximate in MVP
- no real-time coaching
- no auth layer yet
- no speaker diarization unless transcription model returns it cleanly
- internal background trigger is simple and intentionally swappable later
- local PDF/FFmpeg behavior depends on host machine binaries
- Vercel Blob access is currently configured as public because that is the straightforward supported upload path in this MVP scaffold; Phase 2 should move sensitive media behind stronger access controls or a proxy-download pattern

## Phase 2 placeholders

- compare against a custom internal delivery framework
- presenter benchmarking and before/after comparisons
- manager review workflow
- Loom/Zoom/Drive ingestion
- stronger body-language analysis

## What is complete

- Next.js App Router scaffold
- upload token route
- job creation, status, report, retry, and health routes
- Prisma data model
- FFmpeg pipeline wrappers
- OpenAI transcription orchestration
- coaching JSON schema and report rendering
- polling-based processing UX

## What is stubbed or basic

- queue transport is minimal and can be replaced later
- visual analysis is best-effort and deliberately lightweight
- auth is left as a clean integration point, not a full implementation
