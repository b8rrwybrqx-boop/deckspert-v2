import test from "node:test";
import assert from "node:assert/strict";

import { bandForScore, scoreFillerRate, scoreWpm, weightedOverall } from "@/lib/coaching/rubric";
import { applyFramingCoverageGuardrails, summarizeDeliverySignals } from "@/lib/coaching/report";
import type { CoachingReport, VisualSignal } from "@/types/delivery";

test("scoreWpm follows the TPG pace bands", () => {
  assert.equal(scoreWpm(135), 9.5); // 120-150 optimal
  assert.equal(scoreWpm(110), 7.5); // 100-119 solid
  assert.equal(scoreWpm(160), 7.5); // 151-170 solid
  assert.equal(scoreWpm(90), 5.5); // 85-99 developing
  assert.equal(scoreWpm(80), 3.5); // <85 distracting
  assert.equal(scoreWpm(190), 3.5); // 180-199 distracting
  assert.equal(scoreWpm(210), 1.5); // 200+ blocking
  assert.equal(scoreWpm(0), 5); // no usable signal, neutral
});

test("scoreFillerRate follows the filler bands", () => {
  assert.equal(scoreFillerRate(0.5), 9.5);
  assert.equal(scoreFillerRate(2), 7.5);
  assert.equal(scoreFillerRate(4), 5.5);
  assert.equal(scoreFillerRate(8), 3.5);
  assert.equal(scoreFillerRate(12), 1.5);
});

test("weightedOverall applies 35/25/25/15 weights", () => {
  // All 8s -> 8.
  assert.equal(weightedOverall({ voicePacing: 8, bodyLanguage: 8, presenceConfidence: 8, audienceEngagement: 8 }), 8);
  // Voice (35%) high, rest low: 10*0.35 + 4*0.25 + 4*0.25 + 4*0.15 = 6.1 -> 6.
  assert.equal(weightedOverall({ voicePacing: 10, bodyLanguage: 4, presenceConfidence: 4, audienceEngagement: 4 }), 6);
});

test("bandForScore maps to rubric labels", () => {
  assert.equal(bandForScore(10), "Polished");
  assert.equal(bandForScore(7), "Solid");
  assert.equal(bandForScore(5), "Developing");
  assert.equal(bandForScore(3), "Distracting");
  assert.equal(bandForScore(1), "Blocking");
});

test("WPM is computed from speaking time, not wall-clock with silence", () => {
  // 8 words spoken across 4 seconds of speech, but spread over a 12s wall-clock
  // window (an 8s pause in the middle). Speaking-rate WPM = 8 / 4 * 60 = 120.
  // The old wall-clock denominator would have given 8 / 12 * 60 = 40.
  const summary = summarizeDeliverySignals([
    { startSec: 0, endSec: 2, text: "one two three four", speaker: null, confidence: null },
    { startSec: 10, endSec: 12, text: "five six seven eight", speaker: null, confidence: null }
  ]);
  assert.equal(summary.wordsPerMinute, 120);
  // The 8s gap is still surfaced as a long pause for the pause-use dimension.
  assert.equal(summary.longPauseCount, 1);
});

function baseReport(): CoachingReport {
  return {
    executiveSummary: "Summary",
    overallScore: 6,
    dimensionScores: { voicePacing: 6, presenceConfidence: 6, bodyLanguage: 6, audienceEngagement: 6 },
    topStrengths: ["A"],
    topPriorityFixes: ["B"],
    coachingMoments: [],
    practicePlan: [{ focusArea: "x", exercise: "y", frequency: "z", goal: "w" }],
    processingNotes: { transcriptConfidence: "ok", visualConfidence: "ok", limitations: [] }
  };
}

function frame(facePresent: boolean | null): VisualSignal {
  return {
    timestamp: "00:00",
    timestampSec: 0,
    facePresent,
    faceCount: null,
    framingConsistency: "unknown",
    motionLevel: "unknown",
    handVisibility: "unknown"
  };
}

test("low framing coverage adds a directional limitation and a camera-setup coaching moment", () => {
  // 2 of 10 frames readable = 20% coverage, below the 50% threshold.
  const visualSignals = [frame(true), frame(true), ...Array.from({ length: 8 }, () => frame(null))];
  const report = applyFramingCoverageGuardrails(baseReport(), visualSignals);
  assert.ok(report.processingNotes.limitations.some((item) => item.includes("directional for this recording")));
  assert.ok(report.coachingMoments.some((moment) => /camera|framing|eye level/i.test(moment.coachingTip)));
});

test("adequate framing coverage does not add the framing guardrail", () => {
  // 8 of 10 frames readable = 80% coverage, above threshold.
  const visualSignals = [...Array.from({ length: 8 }, () => frame(true)), frame(null), frame(null)];
  const report = applyFramingCoverageGuardrails(baseReport(), visualSignals);
  assert.equal(report.processingNotes.limitations.length, 0);
  assert.equal(report.coachingMoments.length, 0);
});

test("filler counting is not corrupted by a shared stateful regex", () => {
  // Multiple consecutive segments each containing a filler must all be counted;
  // a shared /g regex with .test() in a filter would skip some of these.
  const summary = summarizeDeliverySignals([
    { startSec: 0, endSec: 2, text: "um so we begin", speaker: null, confidence: null },
    { startSec: 2, endSec: 4, text: "uh the next point", speaker: null, confidence: null },
    { startSec: 4, endSec: 6, text: "like the third idea", speaker: null, confidence: null }
  ]);
  assert.equal(summary.fillerCount, 3);
});
