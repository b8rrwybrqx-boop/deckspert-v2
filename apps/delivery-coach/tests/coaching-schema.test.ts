import test from "node:test";
import assert from "node:assert/strict";

import { coachingReportSchema } from "@/lib/validation/delivery";

test("coachingReportSchema accepts a minimally valid report", () => {
  const parsed = coachingReportSchema.parse({
    executiveSummary: "Summary",
    overallScore: 7,
    dimensionScores: {
      voicePacing: 7,
      presenceConfidence: 6,
      bodyLanguage: 5,
      audienceEngagement: 7
    },
    topStrengths: ["A", "B", "C"],
    topPriorityFixes: ["D", "E", "F"],
    coachingMoments: [],
    practicePlan: [
      {
        focusArea: "Pace",
        exercise: "Practice",
        frequency: "Daily",
        goal: "Improve"
      }
    ],
    processingNotes: {
      transcriptConfidence: "Good",
      visualConfidence: "Limited",
      limitations: []
    }
  });

  assert.equal(parsed.overallScore, 7);
});
