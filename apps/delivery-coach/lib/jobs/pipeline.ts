import { DeliveryJobStatus, DerivedAssetType } from "@prisma/client";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendProcessingEvent,
  createDerivedAsset,
  getDeliveryJob,
  replaceTranscriptSegments,
  saveVisualSignals,
  updateDeliveryJobStatus,
  upsertCoachingReport
} from "../db/jobs.js";
import { uploadDerivedAsset } from "../blob/server.js";
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
    transcription.limitations.forEach(async (message) => {
      await appendProcessingEvent(jobId, DeliveryJobStatus.transcribing, message);
    });
    limitations.push(...transcription.limitations);

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.sampling_frames);
    await appendProcessingEvent(jobId, DeliveryJobStatus.sampling_frames, "Sampling frames for lightweight visual signals.");
    const sampledFrames = await sampleFrames(sourceInput, 10, 12);
    const uploadedFrames = await Promise.all(
      sampledFrames.map(async (frame) => {
        const blob = await uploadDerivedAsset(
          `delivery/${jobId}/frames/frame-${Math.round(frame.timestampSec)}.jpg`,
          await readBinaryFile(frame.filePath),
          "image/jpeg"
        );
        await createDerivedAsset(jobId, DerivedAssetType.frame, blob.url, { timestampSec: frame.timestampSec });
        return {
          ...frame,
          frameUrl: blob.url
        };
      })
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
