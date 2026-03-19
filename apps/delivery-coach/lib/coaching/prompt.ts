import { formatTimestamp } from "../transcription/merge.js";
import type { TranscriptSegmentRecord, VisualSignal } from "../../types/delivery.js";

type BuildPromptInput = {
  userContext?: string | null;
  transcript: TranscriptSegmentRecord[];
  visualSignals: VisualSignal[];
  signalSummary: {
    wordsPerMinute: number;
    fillerCount: number;
    longPauseCount: number;
    averageSegmentLengthSec: number;
  };
};

export function buildCoachingPrompt(input: BuildPromptInput) {
  const fillerRatePerMinute =
    input.signalSummary.wordsPerMinute > 0
      ? Number(((input.signalSummary.fillerCount / input.signalSummary.wordsPerMinute) * 60).toFixed(1))
      : 0;
  const transcriptExcerpt = input.transcript
    .slice(0, 30)
    .map((segment) => `[${formatTimestamp(segment.startSec)}-${formatTimestamp(segment.endSec)}] ${segment.text}`)
    .join("\n");

  const visualExcerpt = input.visualSignals
    .slice(0, 10)
    .map((signal) => `[${signal.timestamp}] framing=${signal.framingConsistency}; motion=${signal.motionLevel}; handVisibility=${signal.handVisibility}`)
    .join("\n");

  return [
    "You are a senior executive presentation coach.",
    "You coach using a TPG-style Dynamic Delivery lens.",
    "Give candid, specific, timestamped delivery feedback based on observable signals.",
    "Prioritize high-leverage coaching over exhaustive commentary.",
    "Separate what is observed from what is inferred.",
    "Use timestamps when describing strengths and weaknesses.",
    "Do not be motivational, generic, or padded.",
    "Sound like an expert executive presentation coach, not a generic AI summary.",
    "Lean on these delivery principles:",
    "- Body language drives credibility. Watch eye contact, visible hands, posture, and movement consistency.",
    "- Voice quality includes pace, pauses, emphasis, pitch, volume, inflection, and tone.",
    "- Filler words reduce credibility and should usually be replaced by deliberate pauses.",
    "- Strong pauses can be logical pauses, impact pauses, or think pauses.",
    "- Transitions matter. Avoid disjointed talk-click-talk-click delivery.",
    "- Executives respond to delivery that sounds clear, deliberate, and in command.",
    "- Call out when confidence, energy, or audience connection appears to rise or drop.",
    "- Mark what the speaker should practice first, not everything they could improve.",
    "If visual signals are weak, say so and rely more heavily on transcript-derived evidence.",
    "If transcript timing is estimated within chunks, still anchor feedback to the best available timestamps and avoid fake precision.",
    "Avoid generic caveats like 'in the MVP'. Make limitations specific to this analysis and the evidence available.",
    "Use actual timestamps from the transcript excerpt when possible. Do not repeat 00:00 for every coaching moment unless the issue truly occurs at the opening.",
    "Return one JSON object only with this exact shape:",
    '{ "executiveSummary": string, "overallScore": number, "dimensionScores": { "voicePacing": number, "presenceConfidence": number, "bodyLanguage": number, "audienceEngagement": number }, "topStrengths": string[], "topPriorityFixes": string[], "coachingMoments": [{ "timestamp": string, "startSec": number, "endSec": number, "title": string, "observation": string, "whyItMatters": string, "coachingTip": string, "severity": "low" | "medium" | "high" }], "practicePlan": [{ "focusArea": string, "exercise": string, "frequency": string, "goal": string }], "processingNotes": { "transcriptConfidence": string, "visualConfidence": string, "limitations": string[] } }',
    "Return valid JSON only.",
    "",
    "User context:",
    input.userContext?.trim() || "No additional context provided.",
    "",
    "Transcript-derived signals:",
    `Words per minute: ${input.signalSummary.wordsPerMinute}`,
    `Filler count: ${input.signalSummary.fillerCount}`,
    `Estimated filler words per minute: ${fillerRatePerMinute}`,
    `Long pauses: ${input.signalSummary.longPauseCount}`,
    `Average segment length (sec): ${input.signalSummary.averageSegmentLengthSec}`,
    "",
    "Transcript excerpt:",
    transcriptExcerpt || "No transcript available.",
    "",
    "Visual signals:",
    visualExcerpt || "No visual signals available."
  ].join("\n");
}
