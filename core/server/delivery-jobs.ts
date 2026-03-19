import prismaClientPkg from "@prisma/client";

import { prisma } from "./prisma.js";
import { upsertUserProfile, type WorkspaceUserIdentity } from "./workspace.js";
import type { CoachingReport, TranscriptSegmentRecord, VisualSignal } from "../../apps/delivery-coach/types/delivery.js";

const { DeliveryJobStatus, DerivedAssetType, Prisma } = prismaClientPkg;
type DeliveryJobStatusValue = (typeof DeliveryJobStatus)[keyof typeof DeliveryJobStatus];
type DerivedAssetTypeValue = (typeof DerivedAssetType)[keyof typeof DerivedAssetType];

type JobCreateInput = {
  originalFilename: string;
  originalBlobUrl: string;
  fileSize: number;
  mimeType: string;
  userContext?: string | null;
  user?: WorkspaceUserIdentity | null;
};

export async function createDeliveryJob(input: JobCreateInput) {
  let canonicalUserId: string | null = input.user?.id ?? null;

  if (input.user) {
    const profile = await upsertUserProfile(input.user);
    canonicalUserId = profile.id;
  }

  return prisma.deliveryJob.create({
    data: {
      userId: canonicalUserId,
      originalFilename: input.originalFilename,
      originalBlobUrl: input.originalBlobUrl,
      fileSize: BigInt(input.fileSize),
      mimeType: input.mimeType,
      userContext: input.userContext ?? null,
      derivedAssets: {
        create: {
          type: DerivedAssetType.original_video,
          blobUrl: input.originalBlobUrl,
          metadataJson: {
            originalFilename: input.originalFilename,
            mimeType: input.mimeType,
            fileSize: input.fileSize
          }
        }
      },
      events: {
        create: {
          stage: DeliveryJobStatus.uploaded,
          message: "Upload complete. Job created and ready for processing."
        }
      }
    }
  });
}

export async function getDeliveryJob(jobId: string) {
  return prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: {
      report: true,
      events: {
        orderBy: { createdAt: "asc" }
      },
      derivedAssets: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function getTranscriptSegments(jobId: string) {
  return prisma.transcriptSegment.findMany({
    where: { jobId },
    orderBy: { startSec: "asc" }
  });
}

export async function appendProcessingEvent(
  jobId: string,
  stage: DeliveryJobStatusValue | string,
  message: string,
  metadataJson?: Record<string, unknown>
) {
  return prisma.processingEvent.create({
    data: {
      jobId,
      stage,
      message,
      metadataJson: (metadataJson ?? Prisma.JsonNull) as any
    }
  });
}

export async function updateDeliveryJobStatus(
  jobId: string,
  status: DeliveryJobStatusValue,
  extras?: Partial<{
    analysisBlobUrl: string | null;
    audioBlobUrl: string | null;
    errorMessage: string | null;
    completedAt: Date;
    failedAt: Date;
    processingLogs: unknown;
  }>
) {
  return prisma.deliveryJob.update({
    where: { id: jobId },
    data: {
      status,
      analysisBlobUrl: extras?.analysisBlobUrl,
      audioBlobUrl: extras?.audioBlobUrl,
      errorMessage: extras?.errorMessage,
      completedAt: extras?.completedAt,
      failedAt: extras?.failedAt,
      processingLogs:
        extras && "processingLogs" in extras ? ((extras.processingLogs ?? Prisma.JsonNull) as any) : undefined
    }
  });
}

export async function createDerivedAsset(
  jobId: string,
  type: DerivedAssetTypeValue,
  blobUrl: string,
  metadataJson?: unknown
) {
  return prisma.derivedAsset.create({
    data: {
      jobId,
      type,
      blobUrl,
      metadataJson: (metadataJson ?? Prisma.JsonNull) as any
    }
  });
}

export async function replaceTranscriptSegments(jobId: string, segments: TranscriptSegmentRecord[]) {
  await prisma.transcriptSegment.deleteMany({ where: { jobId } });
  if (!segments.length) {
    return;
  }

  await prisma.transcriptSegment.createMany({
    data: segments.map((segment) => ({
      jobId,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text,
      speaker: segment.speaker ?? null,
      confidence: segment.confidence ?? null
    }))
  });
}

export async function upsertCoachingReport(jobId: string, report: CoachingReport) {
  return prisma.coachingReport.upsert({
    where: { jobId },
    update: {
      reportJson: report,
      overallScore: report.overallScore,
      executiveSummary: report.executiveSummary
    },
    create: {
      jobId,
      reportJson: report,
      overallScore: report.overallScore,
      executiveSummary: report.executiveSummary
    }
  });
}

export async function saveVisualSignals(jobId: string, signals: VisualSignal[]) {
  if (!signals.length) {
    return;
  }

  await prisma.derivedAsset.create({
    data: {
      jobId,
      type: DerivedAssetType.frame_manifest,
      blobUrl: `internal://visual-signals/${jobId}`,
      metadataJson: { signals }
    }
  });
}
