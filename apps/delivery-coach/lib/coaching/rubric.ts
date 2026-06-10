/**
 * Own the Room — Dynamic Delivery Scoring Rubric v2.0
 *
 * Single source of truth for scoring thresholds, band language, weights, and
 * coaching structure. Both the deterministic scorer (report.ts) and the LLM
 * prompt (prompt.ts) import from here so the number and the coaching always
 * agree, because they come from the same source.
 *
 * Mirrors OwnTheRoom_Dynamic_Delivery_Rubric_v2.docx. When a threshold changes,
 * change it HERE first, then the prompt and scoring follow.
 */

// ── Shared band language (Section 2) ──────────────────────────────────────────
// Every dimension uses the same band meaning. A 7 means the same thing across
// all four dimensions.

export type BandLabel = "Polished" | "Solid" | "Developing" | "Distracting" | "Blocking";

export const SCORE_BANDS: Array<{ min: number; max: number; label: BandLabel; meaning: string }> = [
  { min: 9, max: 10, label: "Polished", meaning: "A genuine strength. Builds trust immediately and gets out of the way of the story." },
  { min: 7, max: 8, label: "Solid", meaning: "Working well. Minor refinements would sharpen it further." },
  { min: 5, max: 6, label: "Developing", meaning: "Competent but inconsistent. A clear opportunity area with a specific path forward." },
  { min: 3, max: 4, label: "Distracting", meaning: "Actively competing with the message. Should be a named priority fix." },
  { min: 1, max: 2, label: "Blocking", meaning: "Getting in the way of the audience receiving the message at all." }
];

export function bandForScore(score: number): BandLabel {
  const clamped = Math.max(1, Math.min(10, Math.round(score)));
  return SCORE_BANDS.find((band) => clamped >= band.min && clamped <= band.max)?.label ?? "Developing";
}

// ── Dimensions and weights (Section 5) ────────────────────────────────────────
// Overall Score is a weighted average. Weights reflect measurability confidence
// and TPG's emphasis on voice and delivery as primary performance drivers.

export type DimensionKey = "voicePacing" | "bodyLanguage" | "presenceConfidence" | "audienceEngagement";

export const DIMENSIONS: Array<{ key: DimensionKey; label: string; weight: number; definition: string }> = [
  {
    key: "voicePacing",
    label: "Voice, Pacing & Filler Words",
    weight: 0.35,
    definition: "Is the speaker easy to listen to? Controlled pace, clean of filler, vocal variety present."
  },
  {
    key: "bodyLanguage",
    label: "Body Language",
    weight: 0.25,
    definition: "Does what the audience sees support the story? Eye line, framing, and hands, evaluated differently for virtual vs in-person."
  },
  {
    key: "presenceConfidence",
    label: "Presence & Confidence",
    weight: 0.25,
    definition: "Does the speaker sound like they believe what they are saying? Opening strength, vocal steadiness, absence of hedging."
  },
  {
    // Internal key stays "audienceEngagement" for schema/storage compatibility.
    // Rubric v2 reframes this dimension as Pacing Variety & Pause Use.
    key: "audienceEngagement",
    label: "Pacing Variety & Pause Use",
    weight: 0.15,
    definition: "Is the Power of Pause being used intentionally? Logical, Impact, and Let 'em Think pauses recognized and rewarded."
  }
];

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = DIMENSIONS.reduce(
  (acc, dimension) => {
    acc[dimension.key] = dimension.weight;
    return acc;
  },
  {} as Record<DimensionKey, number>
);

export function weightedOverall(scores: Record<DimensionKey, number>): number {
  const total = DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension.key] * dimension.weight, 0);
  return Math.max(1, Math.min(10, Math.round(total)));
}

// ── Dimension 1: Voice, Pacing & Filler Words (Section 3.1) ───────────────────
// TPG pace targets. WPM is speaking rate; filler is per-minute of speech.

export const WPM_BANDS: Array<{ score: number; min: number; max: number; tpgLabel: string }> = [
  { score: 9.5, min: 120, max: 150, tpgLabel: "Optimal" }, // Polished
  { score: 7.5, min: 100, max: 170, tpgLabel: "Good" }, // Solid (100-119 or 151-170)
  { score: 5.5, min: 85, max: 179, tpgLabel: "Developing" }, // Developing (85-99 or 171-179)
  { score: 3.5, min: 1, max: 199, tpgLabel: "Priority Fix" }, // Distracting (<85 or 180-199)
  { score: 1.5, min: 200, max: Infinity, tpgLabel: "Critical" } // Blocking (200+)
];

/** Score speaking rate on the 1-10 scale per the TPG pace targets. */
export function scoreWpm(wpm: number): number {
  if (wpm <= 0) return 5; // No usable signal — neutral, do not penalize blind.
  if (wpm >= 120 && wpm <= 150) return 9.5;
  if ((wpm >= 100 && wpm <= 119) || (wpm >= 151 && wpm <= 170)) return 7.5;
  if ((wpm >= 85 && wpm <= 99) || (wpm >= 171 && wpm <= 179)) return 5.5;
  if (wpm < 85 || (wpm >= 180 && wpm <= 199)) return 3.5;
  return 1.5; // 200+
}

/** Score filler frequency (fillers per minute of speech) on the 1-10 scale. */
export function scoreFillerRate(fillerPerMin: number): number {
  if (fillerPerMin < 1) return 9.5;
  if (fillerPerMin <= 2) return 7.5;
  if (fillerPerMin <= 5) return 5.5;
  if (fillerPerMin <= 9) return 3.5;
  return 1.5; // 10+
}

// Filler words tracked (Section 3.1).
export const FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "sort of",
  "kind of",
  "basically"
] as const;

// ── Dimension 2: Body Language (Section 3.2) ──────────────────────────────────

export type DeliveryContext = "virtual" | "in_person";

/** Eye-line to camera, % of sampled frames facing the lens (virtual). */
export function scoreEyeLine(cameraContactRatio: number): number {
  const pct = cameraContactRatio * 100;
  if (pct >= 70) return 9.5;
  if (pct >= 50) return 7.5;
  if (pct >= 35) return 5.5;
  if (pct >= 10) return 3.5;
  return 1.5;
}

// The four moments where camera contact matters most (secondary eye-line flag).
export const KEY_STORY_MOMENTS = ["Opening Gambit", "Big Idea", "WIIFM", "Close / Call to Action"] as const;

// ── Dimension 4: Pacing Variety & Pause Use — the TPG Pause Taxonomy (3.4) ─────

export const PAUSE_TAXONOMY = [
  { type: "Logical Pause", approxSec: 1, signal: "positive", context: "Natural breath between ideas. Replaces filler. Baseline of clean delivery." },
  { type: "Impact Pause", approxSec: 2, signal: "strongly positive", context: "Used BEFORE a key point. Commands attention. Never penalized." },
  { type: "Let 'em Think Pause", approxSec: 3, signal: "positive", context: "Given after a key point or question. Invites processing. A sign of confidence." },
  { type: "Unintended Dead Air", approxSec: 3, signal: "negative", context: "Unplanned 3+ sec gap. No preceding key moment, high frequency, often followed by filler." }
] as const;

// ── Honesty and confidence rules (Section 6) ──────────────────────────────────

export const HONESTY_RULES = [
  "Voice and transcript signals are higher confidence than visual signals. Always.",
  "Visual findings from sampled frames are directional. Label them as such when frame coverage is limited.",
  "When video is short, framing is poor, or frame coverage is truncated, state it. Offer what can be scored and flag what cannot.",
  "Never present a proxy as a measurement. Segment length is not engagement. Filler count is not the full picture of confidence.",
  "When the score and the coaching would disagree, the rubric wins. Revisit the narrative until they align.",
  "A long pause is never automatically negative. Check context before flagging it.",
  "A presenter in a poorly framed or positioned recording is not a poor presenter. Separate what you see from what you cannot."
] as const;
