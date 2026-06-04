import { getEnv } from "../env.js";
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

type RawFrameAnalysis = {
  index?: number;
  facePresent?: boolean | null;
  faceCount?: number | null;
  framingConsistency?: string;
  motionLevel?: string;
  handVisibility?: string;
  notes?: string;
};

const FRAMING_VALUES = new Set(["consistent", "mixed", "unknown"]);
const MOTION_VALUES = new Set(["low", "medium", "high", "unknown"]);
const HAND_VALUES = new Set(["visible", "limited", "unknown"]);

function coerceEnum(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function placeholderSignal(frame: FrameInput, notes: string): VisualSignal {
  return visualSignalSchema.parse({
    timestamp: formatTimestamp(frame.timestampSec),
    timestampSec: frame.timestampSec,
    frameUrl: frame.frameUrl,
    facePresent: null,
    faceCount: null,
    framingConsistency: "unknown",
    motionLevel: "unknown",
    handVisibility: "unknown",
    notes
  });
}

const VISION_INSTRUCTIONS = [
  "You are a vision analyst supporting an executive presentation-delivery coach.",
  "You are given a time-ordered batch of still frames sampled from a presentation video, each labeled with its timestamp.",
  "For each frame, judge only what is visible. Do not invent detail you cannot see.",
  "Assess body-language signals that affect perceived credibility: whether the speaker's face is visible and facing the camera, whether hands are visible, posture, and framing.",
  "motionLevel and framingConsistency are relative judgments across the sequence: compare each frame to the others in this batch (energy/pose change for motion; stability of framing and position for consistency). The first frame may be 'unknown' if there is nothing to compare against.",
  "Return ONLY a JSON object of the form:",
  '{ "frames": [{ "index": number, "facePresent": boolean | null, "faceCount": number | null, "framingConsistency": "consistent" | "mixed" | "unknown", "motionLevel": "low" | "medium" | "high" | "unknown", "handVisibility": "visible" | "limited" | "unknown", "notes": string }] }',
  "Return one entry per frame, in the same order, with index matching the frame label. notes should be a short, concrete body-language observation (posture, eye line, hands, framing).",
  "Return valid JSON only."
].join("\n");

async function analyzeFrameBatch(frames: FrameInput[]): Promise<VisualSignal[]> {
  const env = getEnv();

  const imageContent = frames.flatMap((frame, index) => {
    if (!frame.frameUrl) {
      return [];
    }
    return [
      { type: "text", text: `Frame ${index} at ${formatTimestamp(frame.timestampSec)}:` },
      { type: "image_url", image_url: { url: frame.frameUrl, detail: "low" } }
    ];
  });

  // No fetchable URLs in this batch (e.g. blob upload failed); fall back to placeholders.
  if (!imageContent.length) {
    return frames.map((frame) =>
      placeholderSignal(frame, "Frame could not be retrieved for visual analysis.")
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISION_INSTRUCTIONS },
        {
          role: "user",
          content: [{ type: "text", text: VISION_INSTRUCTIONS }, ...imageContent]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Vision response did not include JSON content.");
  }

  const parsed = JSON.parse(content) as { frames?: RawFrameAnalysis[] };
  const byIndex = new Map<number, RawFrameAnalysis>();
  (parsed.frames ?? []).forEach((entry, position) => {
    const index = typeof entry.index === "number" ? entry.index : position;
    byIndex.set(index, entry);
  });

  return frames.map((frame, index) => {
    const analysis = byIndex.get(index);
    if (!analysis) {
      return placeholderSignal(frame, "Vision model did not return an entry for this frame.");
    }
    return visualSignalSchema.parse({
      timestamp: formatTimestamp(frame.timestampSec),
      timestampSec: frame.timestampSec,
      frameUrl: frame.frameUrl,
      facePresent: typeof analysis.facePresent === "boolean" ? analysis.facePresent : null,
      faceCount: typeof analysis.faceCount === "number" ? analysis.faceCount : null,
      framingConsistency: coerceEnum(analysis.framingConsistency, FRAMING_VALUES, "unknown"),
      motionLevel: coerceEnum(analysis.motionLevel, MOTION_VALUES, "unknown"),
      handVisibility: coerceEnum(analysis.handVisibility, HAND_VALUES, "unknown"),
      notes: typeof analysis.notes === "string" && analysis.notes.trim() ? analysis.notes.trim() : undefined
    });
  });
}

export async function analyzeSampledFrames(frames: FrameInput[]): Promise<VisualAnalysisOutcome> {
  if (!frames.length) {
    return {
      signals: [],
      confidenceLabel: "No sampled frames were available.",
      limitations: ["Frame extraction did not produce usable stills, so body-language confidence is reduced."]
    };
  }

  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    return {
      signals: frames.map((frame) =>
        placeholderSignal(frame, "Frame sampled, but visual analysis was skipped because OpenAI is not configured.")
      ),
      confidenceLabel: "Visual signals were not analyzed because OpenAI is not configured.",
      limitations: [
        "Body-language analysis was skipped because the vision model is not configured, so visual feedback is unavailable for this recording."
      ]
    };
  }

  const batchSize = Math.max(1, env.DELIVERY_VISION_BATCH_SIZE);
  const signals: VisualSignal[] = [];
  let failedBatches = 0;

  for (let start = 0; start < frames.length; start += batchSize) {
    const batch = frames.slice(start, start + batchSize);
    try {
      signals.push(...(await analyzeFrameBatch(batch)));
    } catch {
      failedBatches += 1;
      signals.push(
        ...batch.map((frame) =>
          placeholderSignal(frame, "This frame was sampled but the visual analysis call failed.")
        )
      );
    }
  }

  const analyzedCount = signals.filter((signal) => signal.facePresent !== null || signal.framingConsistency !== "unknown").length;

  const limitations = [
    "Body-language findings come from still frames sampled across the video, not continuous motion tracking, so treat motion and gesture cues as directional.",
    "Visual feedback is somewhat lower confidence than the voice read because it is based on sampled images rather than frame-by-frame video."
  ];
  if (failedBatches > 0) {
    limitations.push(
      `Visual analysis failed for ${failedBatches} batch${failedBatches === 1 ? "" : "es"} of frames, so coverage of body language is partial.`
    );
  }

  return {
    signals,
    confidenceLabel:
      analyzedCount > 0
        ? `Visual signals come from vision analysis of ${signals.length} sampled frame${signals.length === 1 ? "" : "s"} across the recording.`
        : "Visual signals are low confidence because frame analysis did not return usable observations.",
    limitations
  };
}
