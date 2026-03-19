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

  for (const chunk of chunks) {
    try {
      const buffer = await readFile(chunk.filePath);
      const formData = new FormData();
      formData.append("model", env.OPENAI_TRANSCRIPTION_MODEL);
      formData.append("response_format", "json");
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

      const payload = (await response.json()) as { text?: string };
      const chunkSegments = estimateSegmentTiming(chunk.startSec, chunk.endSec, payload.text ?? "");

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

  return {
    segments: merged,
    limitations,
      confidenceLabel:
      merged.length > 0
        ? limitations.length
          ? "Transcript generated from chunk-level JSON responses, with partial chunk failures."
          : "Transcript generated from chunk-level JSON responses. Timing windows are approximate within each chunk, so exact timestamps are not shown in the report."
        : "Transcript could not be generated from the available audio."
  };
}
