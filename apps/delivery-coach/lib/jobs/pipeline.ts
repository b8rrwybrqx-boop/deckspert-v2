import { DeliveryJobStatus, DerivedAssetType } from "@prisma/client";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendProcessingEvent,
  createDerivedAsset,
  createDerivedAssets,
  getDeliveryJob,
  replaceTranscriptSegments,
  saveVisualSignals,
  updateDeliveryJobStatus,
  upsertCoachingReport
} from "../db/jobs.js";
import { uploadDerivedAsset } from "../blob/server.js";
import { getEnv } from "../env.js";
import { generateCoachingReport } from "../coaching/report.js";
import {
  chunkAudio,
  cleanupTempPath,
  ensureFfmpegAvailable,
  extractMonoAudio,
  readBinaryFile,
  sampleFrames,
} from "../ffmpeg/ffmpeg.js";
import { transcribeAudioChunks } from "../transcription/openai.js";
import { analyzeSampledFrames } from "../visual/analysis.js";

export async function runDeliveryJobPipeline(jobId: string) {
  const job = await getDeliveryJob(jobId);
  if (!job) {
    throw new Error(`Delivery job ${jobId} was not found.`);
  }

  const limitations: string[] = [];

  try {
    await ensureFfmpegAvailable();
  } catch (error) {
    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.failed, {
      errorMessage: `FFmpeg is not available: ${error instanceof Error ? error.message : "unknown error"}`,
      failedAt: new Date()
    });
    await appendProcessingEvent(jobId, DeliveryJobStatus.failed, "FFmpeg availability check failed.");
    return;
  }

  try {
    const sourceInput = job.originalBlobUrl;

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.compressing);
    await appendProcessingEvent(
      jobId,
      DeliveryJobStatus.compressing,
      "Preparing the uploaded video for audio extraction and lightweight frame sampling."
    );

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.extracting_audio);
    await appendProcessingEvent(jobId, DeliveryJobStatus.extracting_audio, "Extracting mono speech audio.");
    const audioPath = join(tmpdir(), `delivery-audio-${jobId}.m4a`);
    await extractMonoAudio(sourceInput, audioPath);
    const audioBlob = await uploadDerivedAsset(
      `delivery/${jobId}/audio/${job.originalFilename.replace(/\s+/g, "-")}.m4a`,
      await readBinaryFile(audioPath),
      "audio/mp4"
    );
    await createDerivedAsset(jobId, DerivedAssetType.audio, audioBlob.url);
    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.extracting_audio, {
      audioBlobUrl: audioBlob.url
    });

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.transcribing);
    await appendProcessingEvent(jobId, DeliveryJobStatus.transcribing, "Chunking and transcribing the audio track.");
    const audioChunks = await chunkAudio(audioPath);
    const transcription = await transcribeAudioChunks(audioChunks);
    await Promise.all([
      cleanupTempPath(audioPath),
      ...audioChunks.map((chunk) => cleanupTempPath(chunk.filePath))
    ]);
    await replaceTranscriptSegments(jobId, transcription.segments);
    for (const message of transcription.limitations) {
      await appendProcessingEvent(jobId, DeliveryJobStatus.transcribing, message);
    }
    limitations.push(...transcription.limitations);

    const env = getEnv();
    const frameIntervalSec = env.DELIVERY_FRAME_INTERVAL_SEC;
    const frameMaxCount = env.DELIVERY_FRAME_MAX_COUNT;

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.sampling_frames);
    await appendProcessingEvent(
      jobId,
      DeliveryJobStatus.sampling_frames,
      `Sampling one frame every ${frameIntervalSec}s for visual body-language analysis.`
    );
    const sampledFrames = await sampleFrames(sourceInput, frameIntervalSec, frameMaxCount);

    if (sampledFrames.length >= frameMaxCount) {
      const coveredMinutes = Math.round(((frameMaxCount - 1) * frameIntervalSec) / 60);
      const truncationNote = `This recording is long enough to hit the ${frameMaxCount}-frame analysis ceiling, so visual body-language coverage spans roughly the first ${coveredMinutes} minute${coveredMinutes === 1 ? "" : "s"}.`;
      limitations.push(truncationNote);
      await appendProcessingEvent(jobId, DeliveryJobStatus.sampling_frames, truncationNote);
    }
    // Upload frames in small concurrent batches (not all at once) so a long
    // recording does not open dozens of simultaneous uploads, then persist all
    // frame rows in a single createMany to respect the limit-1 connection pool.
    const FRAME_UPLOAD_CONCURRENCY = 6;
    const uploadedFrames: Array<{ filePath: string; timestampSec: number; frameUrl: string }> = [];
    for (let start = 0; start < sampledFrames.length; start += FRAME_UPLOAD_CONCURRENCY) {
      const batch = sampledFrames.slice(start, start + FRAME_UPLOAD_CONCURRENCY);
      const uploaded = await Promise.all(
        batch.map(async (frame) => {
          const blob = await uploadDerivedAsset(
            `delivery/${jobId}/frames/frame-${Math.round(frame.timestampSec)}.jpg`,
            await readBinaryFile(frame.filePath),
            "image/jpeg"
          );
          return { ...frame, frameUrl: blob.url };
        })
      );
      uploadedFrames.push(...uploaded);
    }
    await createDerivedAssets(
      jobId,
      uploadedFrames.map((frame) => ({
        type: DerivedAssetType.frame,
        blobUrl: frame.frameUrl,
        metadataJson: { timestampSec: frame.timestampSec }
      }))
    );
    await Promise.all(sampledFrames.map((frame) => cleanupTempPath(frame.filePath)));
    const visualAnalysis = await analyzeSampledFrames(uploadedFrames);
    await saveVisualSignals(jobId, visualAnalysis.signals);
    limitations.push(...visualAnalysis.limitations);

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.generating_coaching);
    await appendProcessingEvent(jobId, DeliveryJobStatus.generating_coaching, "Generating structured coaching report.");
    const report = await generateCoachingReport({
      userContext: job.userContext,
      transcript: transcription.segments,
      visualSignals: visualAnalysis.signals,
      transcriptConfidence: transcription.confidenceLabel,
      visualConfidence: visualAnalysis.confidenceLabel,
      additionalLimitations: limitations
    });
    await upsertCoachingReport(jobId, report);

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.complete, {
      completedAt: new Date(),
      processingLogs: {
        transcriptSegments: transcription.segments.length,
        sampledFrames: uploadedFrames.length,
        limitations
      }
    });
    await appendProcessingEvent(jobId, DeliveryJobStatus.complete, "Delivery coaching report is ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline failure";
    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.failed, {
      errorMessage: message,
      failedAt: new Date()
    });
    await appendProcessingEvent(jobId, DeliveryJobStatus.failed, "Pipeline failed.", {
      error: message
    });
  }
}
