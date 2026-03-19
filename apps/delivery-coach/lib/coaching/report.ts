import { getEnv } from "../env.js";
import { buildCoachingPrompt } from "./prompt.js";
import { coachingReportSchema } from "../validation/delivery.js";
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

const fillerRegex = /\b(um|uh|like|you know|sort of|kind of)\b/gi;

export function summarizeDeliverySignals(transcript: TranscriptSegmentRecord[]): SignalSummary {
  const totalWords = transcript.reduce((sum, segment) => sum + segment.text.split(/\s+/).filter(Boolean).length, 0);
  const totalDuration = transcript.length ? transcript[transcript.length - 1].endSec - transcript[0].startSec : 0;
  const fillerMoments = transcript
    .filter((segment) => fillerRegex.test(segment.text))
    .map((segment) => ({
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text
    }));
  fillerRegex.lastIndex = 0;

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

  return {
    wordsPerMinute: totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 0,
    fillerCount: fillerMoments.reduce((count, moment) => count + (moment.text.match(fillerRegex)?.length ?? 0), 0),
    fillerRatePerMinute:
      totalDuration > 0
        ? Number(
            (
              fillerMoments.reduce((count, moment) => count + (moment.text.match(fillerRegex)?.length ?? 0), 0) /
              (totalDuration / 60)
            ).toFixed(1)
          )
        : 0,
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

function deriveDeterministicScores(signalSummary: SignalSummary, visualSignals: VisualSignal[]) {
  const pacePenalty =
    signalSummary.wordsPerMinute > 175 ? 3 : signalSummary.wordsPerMinute > 165 ? 2 : signalSummary.wordsPerMinute < 105 && signalSummary.wordsPerMinute > 0 ? 1.5 : 0;
  const fillerPenalty =
    signalSummary.fillerRatePerMinute > 10
      ? 4
      : signalSummary.fillerRatePerMinute > 6
        ? 3
        : signalSummary.fillerRatePerMinute > 3
          ? 2
          : signalSummary.fillerRatePerMinute > 1
            ? 1
            : 0;
  const pausePenalty = signalSummary.longPauseCount >= 8 ? 2 : signalSummary.longPauseCount >= 4 ? 1 : 0;
  const segmentPenalty = signalSummary.averageSegmentLengthSec > 8 ? 1.5 : signalSummary.averageSegmentLengthSec > 6 ? 1 : 0;
  const visualPenalty = visualSignals.length ? 0 : 1;

  const voicePacing = clampScore(9 - pacePenalty - fillerPenalty);
  const presenceConfidence = clampScore(8 - fillerPenalty - pausePenalty - visualPenalty);
  const bodyLanguage = clampScore(
    visualSignals.length
      ? 6
      : 5
  );
  const audienceEngagement = clampScore(8 - segmentPenalty - pausePenalty - (signalSummary.wordsPerMinute > 175 ? 1 : 0));
  const overallScore = clampScore((voicePacing + presenceConfidence + bodyLanguage + audienceEngagement) / 4);

  return {
    overallScore,
    dimensionScores: {
      voicePacing,
      presenceConfidence,
      bodyLanguage,
      audienceEngagement
    }
  };
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
  signalSummary: SignalSummary
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
          startSec,
          endSec,
          timestamp: formatTimestampFromSeconds(startSec),
          severity: normalizeSeverity(item.severity)
        };
      })
      .slice(0, 6);
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
      severity: "low"
    });
  }

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
        ...(transcript.length ? [] : ["Transcript coverage was limited, so the analysis leans more on partial signals than a full verbal read."]),
        ...(visualSignals.length
          ? ["Visual/body-language analysis is approximate in the MVP and should be treated as directional."]
          : ["Visual analysis was not available, so body-language feedback is lower confidence."])
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
    return fallback;
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

    const parsed = coachingReportSchema.parse(normalizeCoachingReport(JSON.parse(content), input.transcript, signalSummary));
    parsed.overallScore = deterministicScores.overallScore;
    parsed.dimensionScores = deterministicScores.dimensionScores;
    parsed.processingNotes.limitations.push(...(input.additionalLimitations ?? []));
    return parsed;
  } catch (error) {
    const fallback = buildFallbackReport(
      input.userContext,
      input.transcript,
      input.visualSignals,
      input.transcriptConfidence,
      input.visualConfidence
    );
    fallback.processingNotes.limitations.push(
      ...(input.additionalLimitations ?? []),
      "Report generation used a fallback coaching path because one part of the model response was incomplete."
    );
    return fallback;
  }
}
