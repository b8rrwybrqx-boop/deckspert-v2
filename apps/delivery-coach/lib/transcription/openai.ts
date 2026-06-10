import { readFile } from "node:fs/promises";

import { getEnv } from "../env.js";
import { formatTimestamp, mergeTranscriptSegments } from "./merge.js";
import { transcriptSegmentSchema } from "../validation/delivery.js";
import type { TranscriptSegmentRecord } from "../../types/delivery.js";

type AudioChunkInput = {
  filePath: string;
  startSec: number;
  endSec: number;
};

type TranscriptionOutcome = {
  segments: TranscriptSegmentRecord[];
  limitations: string[];
  confidenceLabel: string;
};

// Whisper verbose_json segment shape (only the fields we use).
type WhisperVerboseSegment = {
  start?: number;
  end?: number;
  text?: string;
  no_speech_prob?: number;
};

// gpt-4o(-mini)-transcribe only support "json" | "text" and cannot return
// timestamps. Only whisper-1 supports verbose_json + segment granularity, which
// is what we need for real pace and pause measurement. Gate on the model name.
function modelSupportsTimestamps(model: string) {
  return /whisper/i.test(model);
}

// Convert whisper verbose_json segments into our records, shifting each segment
// by the chunk's absolute start so timestamps are wall-clock across the whole
// recording (not relative to each chunk).
function mapWhisperSegments(chunkStartSec: number, segments: WhisperVerboseSegment[]): TranscriptSegmentRecord[] {
  const records: TranscriptSegmentRecord[] = [];
  for (const segment of segments) {
    const text = (segment.text ?? "").trim();
    if (!text) continue;
    if (typeof segment.start !== "number" || typeof segment.end !== "number") continue;
    const startSec = Math.max(0, chunkStartSec + segment.start);
    const endSec = Math.max(startSec, chunkStartSec + segment.end);
    records.push(
      transcriptSegmentSchema.parse({
        startSec,
        endSec,
        text,
        speaker: null,
        // Whisper gives no_speech_prob; invert into a rough confidence signal.
        confidence:
          typeof segment.no_speech_prob === "number"
            ? Math.max(0, Math.min(1, 1 - segment.no_speech_prob))
            : null
      })
    );
  }
  return records;
}

function estimateSegmentTiming(
  chunkStartSec: number,
  chunkEndSec: number,
  text: string
): TranscriptSegmentRecord[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const parts = sentences.length ? sentences : [normalized];
  const totalDuration = Math.max(5, chunkEndSec - chunkStartSec);
  const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1;

  let cursor = chunkStartSec;

  return parts.map((part, index) => {
    const proportion = part.length / totalChars;
    const duration = index === parts.length - 1 ? chunkEndSec - cursor : Math.max(2, totalDuration * proportion);
    const startSec = cursor;
    const endSec = Math.min(chunkEndSec, cursor + duration);
    cursor = endSec;

    return transcriptSegmentSchema.parse({
      startSec,
      endSec,
      text: part,
      speaker: null,
      confidence: null
    });
  });
}

export async function transcribeAudioChunks(chunks: AudioChunkInput[]): Promise<TranscriptionOutcome> {
  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    return {
      segments: [],
      limitations: ["OpenAI API key is not configured, so transcription was skipped."],
      confidenceLabel: "No transcription was generated because OpenAI is not configured."
    };
  }

  const output: TranscriptSegmentRecord[] = [];
  const limitations: string[] = [];
  const useTimestamps = modelSupportsTimestamps(env.OPENAI_TRANSCRIPTION_MODEL);
  let estimatedTimingUsed = false;

  for (const chunk of chunks) {
    try {
      const buffer = await readFile(chunk.filePath);
      const formData = new FormData();
      formData.append("model", env.OPENAI_TRANSCRIPTION_MODEL);
      // Real per-segment timestamps require whisper verbose_json; other models
      // only return plain text, so we fall back to estimated timing for those.
      formData.append("response_format", useTimestamps ? "verbose_json" : "json");
      if (useTimestamps) {
        formData.append("timestamp_granularities[]", "segment");
      }
      formData.append(
        "file",
        new File([buffer], `chunk-${Math.round(chunk.startSec)}.m4a`, {
          type: "audio/mp4"
        })
      );

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as { text?: string; segments?: WhisperVerboseSegment[] };

      // Prefer real timestamps from whisper; fall back to character-proportional
      // estimation only when the model/response did not provide segment timing.
      let chunkSegments = useTimestamps && Array.isArray(payload.segments)
        ? mapWhisperSegments(chunk.startSec, payload.segments)
        : [];
      if (!chunkSegments.length) {
        if (useTimestamps) estimatedTimingUsed = true;
        chunkSegments = estimateSegmentTiming(chunk.startSec, chunk.endSec, payload.text ?? "");
      }

      if (!chunkSegments.length) {
        throw new Error("Transcription response did not include usable text.");
      }

      output.push(...chunkSegments);
    } catch (error) {
      limitations.push(
        `A transcript chunk starting at ${formatTimestamp(chunk.startSec)} failed and was skipped. ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  const merged = mergeTranscriptSegments(output);
  const timingIsReal = useTimestamps && !estimatedTimingUsed;

  if (!timingIsReal && merged.length > 0) {
    limitations.push(
      "Speech timing was estimated rather than measured, so pace (WPM) and pause findings are directional. Configure a transcription model that returns timestamps (whisper-1) for measured timing."
    );
  }

  return {
    segments: merged,
    limitations,
    confidenceLabel:
      merged.length > 0
        ? timingIsReal
          ? limitations.length
            ? "Transcript generated with measured per-segment timestamps, with partial chunk failures."
            : "Transcript generated with measured per-segment timestamps from the audio."
          : "Transcript generated from text-only transcription; segment timing is estimated, so exact timestamps and pace are directional."
        : "Transcript could not be generated from the available audio."
  };
}
