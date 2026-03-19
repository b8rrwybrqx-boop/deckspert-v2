import type { TranscriptSegmentRecord } from "../../types/delivery.js";

export function mergeTranscriptSegments(segments: TranscriptSegmentRecord[]): TranscriptSegmentRecord[] {
  const sorted = [...segments].sort((left, right) => left.startSec - right.startSec);
  const merged: TranscriptSegmentRecord[] = [];

  for (const segment of sorted) {
    const trimmedText = segment.text.trim();
    if (!trimmedText) {
      continue;
    }

    const previous = merged[merged.length - 1];
    const shouldMerge =
      previous &&
      previous.speaker === (segment.speaker ?? null) &&
      segment.startSec - previous.endSec <= 0.35;

    if (shouldMerge) {
      previous.endSec = Math.max(previous.endSec, segment.endSec);
      previous.text = `${previous.text} ${trimmedText}`.trim();
      previous.confidence =
        typeof previous.confidence === "number" && typeof segment.confidence === "number"
          ? Math.min(1, (previous.confidence + segment.confidence) / 2)
          : previous.confidence ?? segment.confidence ?? null;
      continue;
    }

    merged.push({
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: trimmedText,
      speaker: segment.speaker ?? null,
      confidence: segment.confidence ?? null
    });
  }

  return merged;
}

export function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
