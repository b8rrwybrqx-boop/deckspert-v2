import { getEnv } from "../env.js";
import { buildCoachingPrompt } from "./prompt.js";
import { coachingReportSchema } from "../validation/delivery.js";
import {
  FILLER_WORDS,
  FRAMING_SETUP_COACHING,
  MIN_ANALYZABLE_FRAME_RATIO,
  scoreFillerRate,
  scoreWpm,
  weightedOverall
} from "./rubric.js";
import type { CoachingReport, TranscriptSegmentRecord, VisualSignal } from "../../types/delivery.js";

type SignalSummary = {
  wordsPerMinute: number;
  fillerCount: number;
  fillerRatePerMinute: number;
  longPauseCount: number;
  averageSegmentLengthSec: number;
  fillerMoments: Array<{ startSec: number; endSec: number; text: string }>;
  pauseMoments: Array<{ startSec: number; endSec: number; text: string }>;
};

type CoachingCategory =
  | "delivery"
  | "clarity"
  | "confidence"
  | "pacing"
  | "fillerWords"
  | "pausing"
  | "structure"
  | "bodyLanguage"
  | "audienceEngagement";

// Build a fresh regex per use. A shared /g regex is stateful (lastIndex
// carries between .test()/.match() calls), which silently miscounts fillers.
function fillerPattern() {
  return new RegExp(`\\b(${FILLER_WORDS.join("|")})\\b`, "gi");
}

function countFillers(text: string) {
  return (text.match(fillerPattern()) ?? []).length;
}

export function summarizeDeliverySignals(transcript: TranscriptSegmentRecord[]): SignalSummary {
  const totalWords = transcript.reduce((sum, segment) => sum + segment.text.split(/\s+/).filter(Boolean).length, 0);

  // WPM is a SPEAKING rate: words divided by time actually spent speaking, not
  // wall-clock. Summing per-segment durations excludes the gaps/silence between
  // segments, so pauses and dead air no longer drag the pace number down. With
  // real (whisper) timestamps this is accurate; with estimated timing it falls
  // back to roughly wall-clock, which is the best the text-only path allows.
  const speakingDurationSec = transcript.reduce(
    (sum, segment) => sum + Math.max(0, segment.endSec - segment.startSec),
    0
  );

  const fillerMoments = transcript
    .filter((segment) => countFillers(segment.text) > 0)
    .map((segment) => ({
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text
    }));

  const pauseMoments = transcript
    .slice(1)
    .map((segment, index) => ({
      gap: segment.startSec - transcript[index].endSec,
      startSec: transcript[index].endSec,
      endSec: segment.startSec,
      text: transcript[index + 1]?.text ?? segment.text
    }))
    .filter((gap) => gap.gap >= 1.5)
    .map((gap) => ({
      startSec: gap.startSec,
      endSec: gap.endSec,
      text: gap.text
    }));

  const fillerCount = fillerMoments.reduce((count, moment) => count + countFillers(moment.text), 0);

  return {
    wordsPerMinute: speakingDurationSec > 0 ? Math.round((totalWords / speakingDurationSec) * 60) : 0,
    fillerCount,
    fillerRatePerMinute:
      speakingDurationSec > 0 ? Number((fillerCount / (speakingDurationSec / 60)).toFixed(1)) : 0,
    longPauseCount: pauseMoments.length,
    averageSegmentLengthSec: transcript.length
      ? Number((transcript.reduce((sum, segment) => sum + (segment.endSec - segment.startSec), 0) / transcript.length).toFixed(1))
      : 0,
    fillerMoments,
    pauseMoments
  };
}

function clampScore(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function deriveBodyLanguageScore(visualSignals: VisualSignal[]) {
  // Only count frames the vision model actually evaluated; all-"unknown" frames
  // (no visual coverage or a failed analysis) should not move the score.
  const analyzed = visualSignals.filter(
    (signal) => signal.facePresent !== null || signal.framingConsistency !== "unknown" || signal.handVisibility !== "unknown"
  );
  if (!analyzed.length) {
    return clampScore(5);
  }

  const faceRatio = analyzed.filter((signal) => signal.facePresent === true).length / analyzed.length;
  const handRatio = analyzed.filter((signal) => signal.handVisibility === "visible").length / analyzed.length;
  const framingKnown = analyzed.filter((signal) => signal.framingConsistency !== "unknown");
  const framingConsistentRatio = framingKnown.length
    ? framingKnown.filter((signal) => signal.framingConsistency === "consistent").length / framingKnown.length
    : 0;

  // Base of 4, rewarding a visible face most, then stable framing and visible hands.
  return clampScore(4 + 3 * faceRatio + 1.5 * framingConsistentRatio + 1.5 * handRatio);
}

// Deterministic scoring per Dynamic Delivery Rubric v2 (the LLM produces the
// nuanced version; this is the floor and the fallback). Bands and weights come
// from rubric.ts so the number and the coaching share one source of truth.
function deriveDeterministicScores(signalSummary: SignalSummary, visualSignals: VisualSignal[]) {
  // Voice (stored as voicePacing): verbal clarity, driven by filler-word rate.
  // Tempo moved to the Pacing dimension below.
  const voicePacing = clampScore(scoreFillerRate(signalSummary.fillerRatePerMinute));

  // Body Language: from sampled visual signals (context-aware branching is
  // layered on with the virtual/in-person declaration).
  const bodyLanguage = deriveBodyLanguageScore(visualSignals);

  // Confidence (stored as presenceConfidence): a voice/narrative dimension.
  // Fillers and unplanned dead air erode perceived certainty; this is the
  // deterministic floor before the LLM weighs opening strength, steadiness,
  // and hedging.
  const fillerPenalty =
    signalSummary.fillerRatePerMinute > 9
      ? 4
      : signalSummary.fillerRatePerMinute > 5
        ? 3
        : signalSummary.fillerRatePerMinute > 2
          ? 1.5
          : 0;
  const deadAirPenalty = signalSummary.longPauseCount >= 8 ? 2 : signalSummary.longPauseCount >= 4 ? 1 : 0;
  const presenceConfidence = clampScore(8 - fillerPenalty - deadAirPenalty);

  // Pacing (stored as audienceEngagement): tempo control. Blend words-per-minute
  // with intentional pause use, penalizing a relentlessly flat read (no pauses)
  // and likely unintended dead air (very high pause counts).
  const pauseUse =
    signalSummary.longPauseCount === 0
      ? 5 // flat, no Power of Pause
      : signalSummary.longPauseCount <= 6
        ? 8 // intentional variety present
        : signalSummary.longPauseCount <= 10
          ? 6
          : 4; // likely unintended dead air
  const audienceEngagement = clampScore((scoreWpm(signalSummary.wordsPerMinute) + pauseUse) / 2);

  const dimensionScores = { voicePacing, bodyLanguage, presenceConfidence, audienceEngagement };
  const overallScore = weightedOverall(dimensionScores);

  return {
    overallScore,
    dimensionScores
  };
}

// Share of sampled frames the vision model could actually read (face detected,
// or framing/hand visibility known). Drives the directional flag + camera-setup
// coaching when framing was poor.
function frameCoverageRatio(visualSignals: VisualSignal[]) {
  if (!visualSignals.length) return 0;
  const analyzed = visualSignals.filter(
    (signal) => signal.facePresent !== null || signal.framingConsistency !== "unknown" || signal.handVisibility !== "unknown"
  );
  return analyzed.length / visualSignals.length;
}

// When framing coverage is low, Body Language is directional: state the
// limitation and turn it into a camera-setup coaching moment for next time.
// Coverage-based on purpose, so it fires on poor framing regardless of the
// resulting score. Applied to both the LLM and fallback report paths.
export function applyFramingCoverageGuardrails(report: CoachingReport, visualSignals: VisualSignal[]): CoachingReport {
  // The "no frames at all" case is handled as missing visual coverage elsewhere;
  // this guard targets the poor-framing case where frames exist but most are
  // unreadable.
  if (!visualSignals.length) return report;
  const coverage = frameCoverageRatio(visualSignals);
  if (coverage >= MIN_ANALYZABLE_FRAME_RATIO) return report;

  const coveragePct = Math.round(coverage * 100);
  const limitation = `Body Language is directional for this recording: only about ${coveragePct}% of sampled frames were clear enough to read (camera angle or framing cut off the presenter). Treat the Body Language score as directional, not definitive.`;
  if (!report.processingNotes.limitations.some((item) => item.includes("directional for this recording"))) {
    report.processingNotes.limitations = [...report.processingNotes.limitations, limitation].slice(0, 8);
  }

  const alreadyCoached = report.coachingMoments.some((moment) =>
    /camera|framing|frame|set ?up|eye level/i.test(`${moment.title} ${moment.observation} ${moment.coachingTip}`)
  );
  if (!alreadyCoached) {
    const framingMoment: CoachingReport["coachingMoments"][number] = {
      category: "bodyLanguage",
      timestamp: "00:00",
      startSec: 0,
      endSec: 0,
      title: FRAMING_SETUP_COACHING.title,
      observation: `Only about ${coveragePct}% of the recording was framed clearly enough to assess your delivery, with hands or upper body out of frame for much of it.`,
      whyItMatters: FRAMING_SETUP_COACHING.whyItMatters,
      coachingTip: FRAMING_SETUP_COACHING.coachingTip,
      severity: "medium"
    };
    report.coachingMoments = [...report.coachingMoments, framingMoment].slice(0, 8);
  }

  return report;
}

function formatTimestampFromSeconds(value: number) {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function inferCoachingCategory(
  title: string,
  observation: string,
  whyItMatters: string,
  coachingTip: string
): CoachingCategory {
  const haystack = `${title} ${observation} ${whyItMatters} ${coachingTip}`.toLowerCase();

  if (/\bfiller/.test(haystack)) return "fillerWords";
  if (/\bpause|dead air/.test(haystack)) return "pausing";
  if (/\bpace|pacing|rushed|slow/.test(haystack)) return "pacing";
  if (/\bbody|gesture|posture|eye line|hands|visual/.test(haystack)) return "bodyLanguage";
  if (/\bconfidence|authority|credible|command/.test(haystack)) return "confidence";
  if (/\baudience|engagement|connection/.test(haystack)) return "audienceEngagement";
  if (/\btransition|structure|flow|signpost/.test(haystack)) return "structure";
  if (/\bclarity|clear|land/.test(haystack)) return "clarity";
  return "delivery";
}

function buildSyntheticCategoryMoment(
  category: CoachingCategory,
  transcript: TranscriptSegmentRecord[],
  signalSummary: SignalSummary,
  visualSignals: VisualSignal[]
) {
  const opening = transcript[0];
  const startSec = opening?.startSec ?? 0;
  const endSec = opening?.endSec ?? 10;

  const templates: Record<CoachingCategory, { title: string; observation: string; whyItMatters: string; coachingTip: string; severity: "low" | "medium" | "high" }> = {
    delivery: {
      title: "Sharpen overall delivery control",
      observation: "The delivery has real moments of strength, but the consistency is not yet where it needs to be.",
      whyItMatters: "Consistent delivery control is what separates a competent presenter from one who commands the room.",
      coachingTip: "Identify the one delivery habit most likely to distract your audience and work on that first.",
      severity: "medium"
    },
    clarity: {
      title: "Make the message easier to follow",
      observation: "Some ideas are getting buried in how they are phrased, making it harder for the listener to keep up.",
      whyItMatters: "Clarity is what turns good content into usable executive communication.",
      coachingTip: "Shorten the sentence, land the point, and separate the main message from the supporting detail.",
      severity: "medium"
    },
    confidence: {
      title: "Sound more in command",
      observation: "There are moments where the delivery gives ground — the phrasing or pace suggests uncertainty rather than authority.",
      whyItMatters: "Executives often judge credibility on command and certainty before they evaluate the content itself.",
      coachingTip: "Slow the opening, clean up the pauses, and deliver the key line as a statement — not an explanation.",
      severity: "medium"
    },
    pacing: {
      title: "Bring the pace under tighter control",
      observation: "The pace has stretches where ideas come too quickly for the audience to absorb them.",
      whyItMatters: "Pacing shapes whether the audience can process key ideas and trust the presenter’s command.",
      coachingTip: "Mark where to slow down, where to pause, and where to add emphasis before the next rehearsal.",
      severity: "medium"
    },
    fillerWords: {
      title: "Replace filler words with silent pauses",
      observation: "Filler words are appearing at points where a deliberate pause would land better.",
      whyItMatters: "Fillers soften authority and signal that the speaker is searching — even when the content is strong.",
      coachingTip: "Replace each filler with a deliberate pause and rehearse that swap until it sounds natural.",
      severity: signalSummary.fillerRatePerMinute > 2 ? "high" : "medium"
    },
    pausing: {
      title: "Use pauses with more intention",
      observation: "Pauses are present, but they do not yet feel like deliberate tools — they read more as gaps than as choices.",
      whyItMatters: "Intentional pauses create authority; accidental silence weakens momentum.",
      coachingTip: "Practice one logical pause, one impact pause, and one think pause in the same section of your talk.",
      severity: "medium"
    },
    structure: {
      title: "Strengthen transitions and structure",
      observation: "The ideas are there, but the connective tissue between them is thin — transitions feel abrupt rather than deliberate.",
      whyItMatters: "Strong transitions help the audience follow the logic instead of working to keep up across disconnected points.",
      coachingTip: "Use explicit transition lines that connect the last point to the next one rather than simply moving on.",
      severity: "medium"
    },
    bodyLanguage: {
      title: visualSignals.length ? "Use body language more deliberately" : "Prioritize a stable visual setup for your next recording",
      observation: visualSignals.length
        ? "The visual read shows some inconsistency — posture, eye line, or hand position is shifting in ways that can undermine credibility."
        : "This recording did not have enough visual coverage to give precise body-language feedback.",
      whyItMatters: "Body language shapes credibility and audience trust even when the verbal content is strong.",
      coachingTip: visualSignals.length
        ? "Fix eye line, keep hands visible, and use gesture deliberately at the moments that need emphasis."
        : "For your next rehearsal, set up facing the camera directly so posture, eye contact, and gesture can be assessed.",
      severity: visualSignals.length ? "medium" : "low"
    },
    audienceEngagement: {
      title: "Create stronger audience connection",
      observation: "The delivery is not consistently directed at the listener — some stretches feel internal rather than outward.",
      whyItMatters: "Engagement keeps the audience inside the logic and makes them feel the recommendation is meant for them.",
      coachingTip: "Use more contrast, cleaner signposts, and a more direct listener-facing delivery at the key turns in your talk.",
      severity: "medium"
    }
  };

  const template = templates[category];
  return {
    category,
    timestamp: formatTimestampFromSeconds(startSec),
    startSec,
    endSec,
    ...template
  };
}

function collectExpectedCategories(candidate: Record<string, unknown>) {
  const summaryText = [
    typeof candidate.executiveSummary === "string" ? candidate.executiveSummary : "",
    ...(Array.isArray(candidate.topStrengths) ? candidate.topStrengths.filter((item): item is string => typeof item === "string") : []),
    ...(Array.isArray(candidate.topPriorityFixes) ? candidate.topPriorityFixes.filter((item): item is string => typeof item === "string") : [])
  ].join(" ");

  const expected = new Set<CoachingCategory>(["pacing", "confidence", "bodyLanguage", "audienceEngagement"]);
  const categoryMatchers: Array<{ category: CoachingCategory; pattern: RegExp }> = [
    { category: "delivery", pattern: /\bdelivery\b/i },
    { category: "clarity", pattern: /\bclarity|clear\b/i },
    { category: "confidence", pattern: /\bconfidence|authority|credible|command\b/i },
    { category: "pacing", pattern: /\bpace|pacing|rushed|slow\b/i },
    { category: "fillerWords", pattern: /\bfiller\b/i },
    { category: "pausing", pattern: /\bpause|pauses|dead air\b/i },
    { category: "structure", pattern: /\bstructure|transition|flow|signpost\b/i },
    { category: "bodyLanguage", pattern: /\bbody language|gesture|posture|eye line|hands|visual\b/i },
    { category: "audienceEngagement", pattern: /\baudience engagement|engagement|connection\b/i }
  ];

  categoryMatchers.forEach(({ category, pattern }) => {
    if (pattern.test(summaryText)) {
      expected.add(category);
    }
  });

  return expected;
}

function findTranscriptMoment(
  title: string,
  observation: string,
  transcript: TranscriptSegmentRecord[],
  signalSummary: SignalSummary,
  usedStarts: Set<number>
) {
  const haystack = `${title} ${observation}`.toLowerCase();

  const openingMoment = transcript[0];
  const closingMoment = transcript[transcript.length - 1];
  const fillerMoment = signalSummary.fillerMoments.find((moment) => !usedStarts.has(moment.startSec));
  const pauseMoment = signalSummary.pauseMoments.find((moment) => !usedStarts.has(moment.startSec));

  if ((/\bopen|\bopening|\bstart/.test(haystack) || haystack.includes("first takeaway")) && openingMoment) {
    return {
      startSec: openingMoment.startSec,
      endSec: openingMoment.endSec
    };
  }

  if ((/\bfiller|\bfillers/.test(haystack) || haystack.includes("clean pauses")) && fillerMoment) {
    return fillerMoment;
  }

  if ((/\bpause|\bpauses/.test(haystack) || haystack.includes("dead air")) && pauseMoment) {
    return pauseMoment;
  }

  if ((/\bclose|\bclosing|\bend/.test(haystack) || haystack.includes("final ask")) && closingMoment) {
    return {
      startSec: closingMoment.startSec,
      endSec: closingMoment.endSec
    };
  }

  const candidates = transcript.filter((segment) => !usedStarts.has(segment.startSec));
  const midCandidate = candidates[Math.min(1, Math.max(0, candidates.length - 1))] ?? candidates[0];
  if (midCandidate) {
    return {
      startSec: midCandidate.startSec,
      endSec: midCandidate.endSec
    };
  }

  return null;
}

function normalizeLimitations(limitations: unknown) {
  if (!Array.isArray(limitations)) {
    return [];
  }

  const replacements = new Map<string, string>([
    [
      "Visual/body-language analysis is approximate in the MVP and should be treated as directional.",
      "Body-language findings are directional because this report relies on sampled frames rather than full-motion pose tracking."
    ],
    [
      "Face detection, hand visibility, and movement analysis are placeholders in the MVP.",
      "Face presence, hand visibility, and movement cues are based on lightweight frame sampling, so treat them as directional rather than precise measurements."
    ],
    [
      "Visual feedback is lower confidence than voice-based feedback and should be interpreted accordingly.",
      "Visual feedback is lower confidence than the voice read because the analysis uses sampled images instead of continuous visual tracking."
    ]
  ]);

  return limitations
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => replacements.get(item) ?? item.replace(/\bin the MVP\b/gi, "in this analysis"))
    .slice(0, 6);
}

function normalizeCoachingReport(
  raw: unknown,
  transcript: TranscriptSegmentRecord[],
  signalSummary: SignalSummary,
  visualSignals: VisualSignal[]
) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const candidate = raw as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...candidate
  };

  if (Array.isArray(candidate.topStrengths)) {
    normalized.topStrengths = candidate.topStrengths.filter((item) => typeof item === "string").slice(0, 3);
  }

  if (Array.isArray(candidate.topPriorityFixes)) {
    normalized.topPriorityFixes = candidate.topPriorityFixes.filter((item) => typeof item === "string").slice(0, 3);
  }

  if (Array.isArray(candidate.practicePlan)) {
    normalized.practicePlan = candidate.practicePlan.slice(0, 4);
  }

  if (Array.isArray(candidate.coachingMoments)) {
    const usedStarts = new Set<number>();
    normalized.coachingMoments = candidate.coachingMoments
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => {
        const title = typeof item.title === "string" ? item.title : "";
        const observation = typeof item.observation === "string" ? item.observation : "";
        const currentStart = typeof item.startSec === "number" ? item.startSec : 0;
        const currentEnd = typeof item.endSec === "number" ? item.endSec : currentStart;
        const currentTimestamp = typeof item.timestamp === "string" ? item.timestamp : "";
        const needsBetterTiming =
          (currentStart === 0 && currentEnd === 0) ||
          (currentTimestamp === "00:00" && !/\bopen|\bopening|\bstart/.test(`${title} ${observation}`.toLowerCase()));

        const replacement = needsBetterTiming ? findTranscriptMoment(title, observation, transcript, signalSummary, usedStarts) : null;
        const startSec = replacement?.startSec ?? currentStart;
        const endSec = replacement?.endSec ?? currentEnd;
        usedStarts.add(startSec);

        return {
          ...item,
          category:
            item.category === "delivery" ||
            item.category === "clarity" ||
            item.category === "confidence" ||
            item.category === "pacing" ||
            item.category === "fillerWords" ||
            item.category === "pausing" ||
            item.category === "structure" ||
            item.category === "bodyLanguage" ||
            item.category === "audienceEngagement"
              ? item.category
              : inferCoachingCategory(title, observation, typeof item.whyItMatters === "string" ? item.whyItMatters : "", typeof item.coachingTip === "string" ? item.coachingTip : ""),
          startSec,
          endSec,
          timestamp: formatTimestampFromSeconds(startSec),
          severity: normalizeSeverity(item.severity)
        };
      })
      .slice(0, 6);
  }

  const expectedCategories = collectExpectedCategories(candidate);
  const currentMoments = Array.isArray(normalized.coachingMoments) ? normalized.coachingMoments as Array<Record<string, unknown>> : [];
  const presentCategories = new Set<CoachingCategory>(
    currentMoments
      .map((moment) => moment.category)
      .filter(
        (category): category is CoachingCategory =>
          category === "delivery" ||
          category === "clarity" ||
          category === "confidence" ||
          category === "pacing" ||
          category === "fillerWords" ||
          category === "pausing" ||
          category === "structure" ||
          category === "bodyLanguage" ||
          category === "audienceEngagement"
      )
  );

  const missingMoments = [...expectedCategories]
    .filter((category) => !presentCategories.has(category))
    .map((category) => buildSyntheticCategoryMoment(category, transcript, signalSummary, visualSignals));

  if (missingMoments.length) {
    normalized.coachingMoments = [...currentMoments, ...missingMoments].slice(0, 8);
  }

  normalized.processingNotes =
    candidate.processingNotes && typeof candidate.processingNotes === "object"
      ? {
          ...(candidate.processingNotes as Record<string, unknown>),
          limitations: normalizeLimitations((candidate.processingNotes as Record<string, unknown>).limitations)
        }
      : candidate.processingNotes;

  return normalized;
}

function buildFallbackReport(
  userContext: string | null | undefined,
  transcript: TranscriptSegmentRecord[],
  visualSignals: VisualSignal[],
  transcriptConfidence: string,
  visualConfidence: string
): CoachingReport {
  const summary = summarizeDeliverySignals(transcript);
  const scores = deriveDeterministicScores(summary, visualSignals);

  const topStrengths = [
    summary.wordsPerMinute > 0 && summary.wordsPerMinute < 165
      ? "The pacing generally stays within a range that can support an executive audience."
      : "The speaker maintains enough message continuity that the delivery does not feel fragmented.",
    summary.longPauseCount > 0
      ? "There are signs of deliberate pause use rather than nonstop rushing."
      : "The delivery carries a coherent message thread rather than isolated talking points.",
    visualSignals.length
      ? "The visual read stayed stable enough to support directional feedback on presence and body language."
      : userContext
        ? `The report stayed grounded in the requested coaching context: ${userContext}.`
        : "The report stays focused on delivery quality rather than drifting into content recap."
  ];

  const topPriorityFixes = [
    summary.wordsPerMinute > 170
      ? "Slow the pace at key takeaways so the audience has time to process the point before you move on."
      : "Create stronger vocal contrast so the most important points land with more authority.",
    summary.fillerRatePerMinute > 1
      ? "Reduce filler words to closer to one per minute by replacing them with deliberate pauses."
      : "Use cleaner impact pauses so transitions and recommendation lines feel more intentional.",
    visualSignals.length
      ? "Tighten body-language consistency so posture, eye line, and gesture support credibility."
      : "Mark the 2–3 moments that deserve stronger vocal emphasis and a more deliberate opening posture."
  ];

  const firstFillerMoment = summary.fillerMoments[0];
  const firstPauseMoment = summary.pauseMoments[0];
  const coachingMoments: CoachingReport["coachingMoments"] = [
    {
      timestamp: transcript[0] ? formatTimestampFromSeconds(transcript[0].startSec) : "00:00",
      startSec: transcript[0]?.startSec ?? 0,
      endSec: transcript[0]?.endSec ?? 10,
      title: "Open with more authority",
      observation:
        summary.wordsPerMinute > 170
          ? "The opening pace sounds slightly rushed, which makes the message land with less control."
          : "The opening would benefit from sounding more intentional and more clearly in command.",
      whyItMatters: "Executives decide quickly whether the presenter sounds credible, prepared, and worth following.",
      coachingTip: "Start one beat slower, land the first takeaway cleanly, and let the first pause do some work for you.",
      category: "confidence",
      severity: "medium"
    }
  ];

  if (firstFillerMoment) {
    coachingMoments.push({
      timestamp: formatTimestampFromSeconds(firstFillerMoment.startSec),
      startSec: firstFillerMoment.startSec,
      endSec: firstFillerMoment.endSec,
      title: "Replace fillers with clean pauses",
      observation: "A filler cluster appears here, which softens authority and makes the delivery sound less prepared.",
      whyItMatters: "Filler words are one of the fastest ways to reduce executive credibility.",
      coachingTip: "Pause silently instead of filling the space. The pause will sound more confident than the filler.",
      category: "fillerWords",
      severity: summary.fillerRatePerMinute > 2 ? "high" : "medium"
    });
  }

  if (firstPauseMoment) {
    coachingMoments.push({
      timestamp: formatTimestampFromSeconds(firstPauseMoment.startSec),
      startSec: firstPauseMoment.startSec,
      endSec: firstPauseMoment.endSec,
      title: "Use pauses more deliberately",
      observation: "There is a noticeable gap here, but it does not yet read as a deliberate impact pause tied to the message.",
      whyItMatters: "Well-placed pauses increase authority; accidental dead air weakens momentum.",
      coachingTip: "Turn this into a true impact pause by landing the key line first, then pausing with intent before the next point.",
      category: "pausing",
      severity: "low"
    });
  }

  const existingCategories = new Set(coachingMoments.map((moment) => moment.category));
  ["pacing", "confidence", "bodyLanguage", "audienceEngagement"].forEach((category) => {
    if (!existingCategories.has(category as CoachingCategory)) {
      coachingMoments.push(
        buildSyntheticCategoryMoment(category as CoachingCategory, transcript, summary, visualSignals)
      );
    }
  });

  return coachingReportSchema.parse({
    executiveSummary:
      transcript.length > 0
        ? "The delivery can support an executive conversation, but stronger pace discipline, cleaner pauses, and more deliberate vocal authority would make the message feel sharper and more credible."
        : "The video was processed, but transcript coverage was limited. The report is directionally useful, but lower confidence than a full analysis.",
    overallScore: scores.overallScore,
    dimensionScores: scores.dimensionScores,
    topStrengths,
    topPriorityFixes,
    coachingMoments,
    practicePlan: [
      {
        focusArea: "Pace and emphasis",
        exercise: "Rehearse the opening minute three times, each time marking one impact pause and one phrase that must land with stronger emphasis.",
        frequency: "Before the next presentation and twice during rehearsal week",
        goal: "Create a more deliberate and authoritative opening."
      },
      {
        focusArea: "Filler reduction",
        exercise: "Record a two-minute section and mark every filler word; redo it replacing each filler with a silent pause.",
        frequency: "Daily for one week",
        goal: "Reduce filler words and increase perceived confidence."
      }
    ],
    processingNotes: {
      transcriptConfidence,
      visualConfidence,
      limitations: [
        ...(transcript.length ? [] : ["Transcript coverage was limited, so the voice and pacing read is based on partial signals."]),
        ...(visualSignals.length
          ? ["Body-language findings are directional because this report relies on sampled frames rather than full-motion analysis."]
          : ["Body-language feedback is lower confidence for this recording because visual coverage was not available."])
      ]
    }
  });
}

export async function generateCoachingReport(input: {
  userContext?: string | null;
  transcript: TranscriptSegmentRecord[];
  visualSignals: VisualSignal[];
  transcriptConfidence: string;
  visualConfidence: string;
  additionalLimitations?: string[];
}): Promise<CoachingReport> {
  const env = getEnv();
  const signalSummary = summarizeDeliverySignals(input.transcript);
  const deterministicScores = deriveDeterministicScores(signalSummary, input.visualSignals);

  if (!env.OPENAI_API_KEY || !input.transcript.length) {
    const fallback = buildFallbackReport(
      input.userContext,
      input.transcript,
      input.visualSignals,
      input.transcriptConfidence,
      input.visualConfidence
    );
    fallback.processingNotes.limitations.push(...(input.additionalLimitations ?? []));
    return applyFramingCoverageGuardrails(fallback, input.visualSignals);
  }

  const prompt = buildCoachingPrompt({
    userContext: input.userContext,
    transcript: input.transcript,
    visualSignals: input.visualSignals,
    signalSummary
  });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_COACHING_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior executive presentation coach. Return only valid JSON that matches the requested schema."
          },
          {
            role: "user",
            content: prompt
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
      throw new Error("Coaching response did not include JSON content.");
    }

    const parsed = coachingReportSchema.parse(normalizeCoachingReport(JSON.parse(content), input.transcript, signalSummary, input.visualSignals));
    parsed.overallScore = deterministicScores.overallScore;
    parsed.dimensionScores = deterministicScores.dimensionScores;
    parsed.processingNotes.limitations.push(...(input.additionalLimitations ?? []));
    return applyFramingCoverageGuardrails(parsed, input.visualSignals);
  } catch (error) {
    const fallback = buildFallbackReport(
      input.userContext,
      input.transcript,
      input.visualSignals,
      input.transcriptConfidence,
      input.visualConfidence
    );
    fallback.processingNotes.limitations.push(...(input.additionalLimitations ?? []));
    return applyFramingCoverageGuardrails(fallback, input.visualSignals);
  }
}
