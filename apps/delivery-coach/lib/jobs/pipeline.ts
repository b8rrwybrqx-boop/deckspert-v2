import { DeliveryJobStatus, DerivedAssetType } from "@prisma/client";
import { writeFile } from "node:fs/promises";
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
  ensureFfmpegAvailable,
  extractMonoAudio,
  readBinaryFile,
  readMediaMetadata,
  sampleFrames,
  transcodeAnalysisVideo
} from "../ffmpeg/ffmpeg.js";
import { transcribeAudioChunks } from "../transcription/openai.js";
import { analyzeSampledFrames } from "../visual/analysis.js";

async function downloadBlobToTemp(url: string, extension: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source blob: ${response.status}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const tempPath = join(tmpdir(), `delivery-${crypto.randomUUID()}.${extension}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "video/quicktime") {
    return "mov";
  }
  return "mp4";
}

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
    const sourcePath = await downloadBlobToTemp(job.originalBlobUrl, extensionFromMime(job.mimeType));

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.compressing);
    await appendProcessingEvent(jobId, DeliveryJobStatus.compressing, "Generating 720p analysis video.");
    const analysisPath = join(tmpdir(), `delivery-analysis-${jobId}.mp4`);
    await transcodeAnalysisVideo(sourcePath, analysisPath);
    const analysisBlob = await uploadDerivedAsset(
      `delivery/${jobId}/analysis/${job.originalFilename.replace(/\s+/g, "-")}.mp4`,
      await readBinaryFile(analysisPath),
      "video/mp4"
    );
    await createDerivedAsset(jobId, DerivedAssetType.analysis_video, analysisBlob.url, await readMediaMetadata(analysisPath));
    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.compressing, {
      analysisBlobUrl: analysisBlob.url
    });

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.extracting_audio);
    await appendProcessingEvent(jobId, DeliveryJobStatus.extracting_audio, "Extracting mono speech audio.");
    const audioPath = join(tmpdir(), `delivery-audio-${jobId}.m4a`);
    await extractMonoAudio(analysisPath, audioPath);
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
    await replaceTranscriptSegments(jobId, transcription.segments);
    transcription.limitations.forEach(async (message) => {
      await appendProcessingEvent(jobId, DeliveryJobStatus.transcribing, message);
    });
    limitations.push(...transcription.limitations);

    await updateDeliveryJobStatus(jobId, DeliveryJobStatus.sampling_frames);
    await appendProcessingEvent(jobId, DeliveryJobStatus.sampling_frames, "Sampling frames for lightweight visual signals.");
    const sampledFrames = await sampleFrames(analysisPath, 10);
    const uploadedFrames = await Promise.all(
      sampledFrames.slice(0, 18).map(async (frame) => {
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
