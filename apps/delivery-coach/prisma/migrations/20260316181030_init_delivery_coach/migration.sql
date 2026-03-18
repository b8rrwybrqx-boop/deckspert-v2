-- CreateEnum
CREATE TYPE "DeliveryJobStatus" AS ENUM ('uploaded', 'queued', 'compressing', 'extracting_audio', 'transcribing', 'sampling_frames', 'generating_coaching', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "DerivedAssetType" AS ENUM ('original_video', 'analysis_video', 'audio', 'audio_chunk', 'frame', 'frame_manifest');

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL,
    "status" "DeliveryJobStatus" NOT NULL DEFAULT 'uploaded',
    "originalFilename" TEXT NOT NULL,
    "originalBlobUrl" TEXT NOT NULL,
    "analysisBlobUrl" TEXT,
    "audioBlobUrl" TEXT,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "userContext" TEXT,
    "processingLogs" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedAsset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "DerivedAssetType" NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DerivedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "speaker" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DerivedAsset_jobId_type_idx" ON "DerivedAsset"("jobId", "type");

-- CreateIndex
CREATE INDEX "TranscriptSegment_jobId_startSec_idx" ON "TranscriptSegment"("jobId", "startSec");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingReport_jobId_key" ON "CoachingReport"("jobId");

-- CreateIndex
CREATE INDEX "ProcessingEvent_jobId_createdAt_idx" ON "ProcessingEvent"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "DerivedAsset" ADD CONSTRAINT "DerivedAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingReport" ADD CONSTRAINT "CoachingReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingEvent" ADD CONSTRAINT "ProcessingEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
