import { readBinaryFile } from "../ffmpeg/ffmpeg.js";
import { formatTimestamp } from "../transcription/merge.js";
import { visualSignalSchema } from "../validation/delivery.js";
import type { VisualSignal } from "../../types/delivery.js";

type FrameInput = {
  filePath: string;
  frameUrl?: string;
  timestampSec: number;
};

type VisualAnalysisOutcome = {
  signals: VisualSignal[];
  confidenceLabel: string;
  limitations: string[];
};

export async function analyzeSampledFrames(frames: FrameInput[]): Promise<VisualAnalysisOutcome> {
  if (!frames.length) {
    return {
      signals: [],
      confidenceLabel: "No sampled frames were available.",
      limitations: ["Frame extraction did not produce usable stills, so body-language confidence is reduced."]
    };
  }

  const signals: VisualSignal[] = [];

  for (const frame of frames.slice(0, 18)) {
    try {
      const binary = await readBinaryFile(frame.filePath);
      signals.push(
        visualSignalSchema.parse({
          timestamp: formatTimestamp(frame.timestampSec),
          timestampSec: frame.timestampSec,
          frameUrl: frame.frameUrl,
          facePresent: null,
          faceCount: null,
          framingConsistency: "unknown",
          motionLevel: binary.byteLength > 0 ? "unknown" : "unknown",
          handVisibility: "unknown",
          notes: "Frame sampled successfully. Visual analysis is intentionally lightweight and directional."
        })
      );
    } catch {
      signals.push(
        visualSignalSchema.parse({
          timestamp: formatTimestamp(frame.timestampSec),
          timestampSec: frame.timestampSec,
          frameUrl: frame.frameUrl,
          facePresent: null,
          faceCount: null,
          framingConsistency: "unknown",
          motionLevel: "unknown",
          handVisibility: "unknown",
          notes: "Frame sample was created but could not be inspected in detail."
        })
      );
    }
  }

  return {
    signals,
    confidenceLabel: "Visual signals are directional because they come from sampled frames rather than continuous motion analysis.",
    limitations: [
      "Face presence, hand visibility, and movement cues come from lightweight frame sampling, so treat them as directional rather than precise measurements.",
      "Visual feedback is lower confidence than the voice read because the analysis uses sampled images instead of continuous visual tracking."
    ]
  };
}
