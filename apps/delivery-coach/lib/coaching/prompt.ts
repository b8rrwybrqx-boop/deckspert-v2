import { formatTimestamp } from "../transcription/merge.js";
import { DIMENSIONS, HONESTY_RULES, PAUSE_TAXONOMY, SCORE_BANDS } from "./rubric.js";
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

  // Rubric-derived guidance (single source of truth in rubric.ts).
  const scaleLines = SCORE_BANDS.map((band) => `- ${band.min}-${band.max} (${band.label}): ${band.meaning}`).join("\n");
  const dimensionLines = DIMENSIONS.map(
    (dimension) => `- ${dimension.label} (${Math.round(dimension.weight * 100)}% of overall): ${dimension.definition}`
  ).join("\n");
  const pauseLines = PAUSE_TAXONOMY.map(
    (pause) => `- ${pause.type} (~${pause.approxSec}s, ${pause.signal}): ${pause.context}`
  ).join("\n");
  const honestyLines = HONESTY_RULES.map((rule) => `- ${rule}`).join("\n");

  // Share of sampled frames the vision model could actually read. Low coverage
  // means Body Language is directional and a camera-setup coaching moment should
  // fire (this is also enforced deterministically after generation).
  const analyzedFrames = input.visualSignals.filter(
    (signal) => signal.facePresent !== null || signal.framingConsistency !== "unknown" || signal.handVisibility !== "unknown"
  ).length;
  const frameCoveragePct = input.visualSignals.length
    ? Math.round((analyzedFrames / input.visualSignals.length) * 100)
    : 0;

  const visualExcerpt = input.visualSignals
    .slice(0, 40)
    .map((signal) => {
      const facePart = signal.facePresent === null ? "face=unknown" : `face=${signal.facePresent ? "visible" : "absent"}`;
      const notePart = signal.notes ? `; observation=${signal.notes}` : "";
      return `[${signal.timestamp}] ${facePart}; framing=${signal.framingConsistency}; motion=${signal.motionLevel}; handVisibility=${signal.handVisibility}${notePart}`;
    })
    .join("\n");

  return [
    "You are Own the Room, scoring presentation delivery against the TPG Dynamic Delivery Rubric v2.",
    "Score and coach from the same evaluation: the number and the coaching narrative must always agree. A 4 cannot read like a 7.",
    "Give candid, specific, timestamped delivery feedback based on observable signals. Prioritize high-leverage coaching over exhaustive commentary. Separate what is observed from what is inferred. Do not be motivational, generic, or padded.",
    "",
    "SCORING SCALE (1-10, same meaning across every dimension):",
    scaleLines,
    "",
    "THE FOUR DIMENSIONS you score (each 1-10), and their weight in the overall score:",
    dimensionLines,
    "Weighted overall = sum(dimension score x weight), rounded and clamped to 1-10. Score every dimension on the 1-10 scale.",
    "",
    "VOICE, PACING & FILLER WORDS targets: optimal pace is 120-150 WPM (solid 100-170); under 1 filler/min is polished, 1-2 solid, 3-5 developing, 6-9 distracting, 10+ blocking. Use the measured Words-per-minute and filler rate below as the anchor for this dimension.",
    "PRESENCE & CONFIDENCE: opening strength, vocal steadiness, intentional pausing read as control; hedging ('I think', 'maybe', 'sort of'), filler, and unintended dead air read as doubt. This is distinct from the voice score, not re-derived from it.",
    "PACING VARIETY & PAUSE USE rewards intentional use of the Power of Pause. A long pause is never automatically penalized:",
    pauseLines,
    "BODY LANGUAGE: judge from the visual signals. For a webcam recording, weight eye line to camera and stable framing; for in-person, judge posture and gesture from what the frame shows and stay directional when coverage is limited.",
    "",
    "HONESTY AND CONFIDENCE RULES (non-negotiable):",
    honestyLines,
    "If transcript timing was estimated rather than measured, treat pace and pause findings as directional and say so. Use actual timestamps from the transcript excerpt; do not repeat 00:00 for every coaching moment unless the issue truly occurs at the opening.",
    "",
    "Return one JSON object only with this exact shape. The dimensionScores keys map to the rubric as: voicePacing = Voice, Pacing & Filler Words; bodyLanguage = Body Language; presenceConfidence = Presence & Confidence; audienceEngagement = Pacing Variety & Pause Use.",
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
    `Frame coverage (share of sampled frames clear enough to read body language): ${frameCoveragePct}% of ${input.visualSignals.length} sampled frames.`,
    "If frame coverage is below 50%, treat Body Language as directional rather than definitive, say so in the limitations, and include one camera-setup coaching moment: position the camera at eye level, centered on head and shoulders, with enough height to keep hands visible when gesturing. Do not penalize a strong presenter for a poorly framed recording.",
    "",
    "Visual signals:",
    visualExcerpt || "No visual signals available."
  ].join("\n");
}
