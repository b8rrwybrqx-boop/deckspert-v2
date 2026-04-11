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
    dimensionCommentary: {
      voicePacing: {
        whatIsWorking: "Steady enough pace.",
        needsImprovement: "Needs more pause discipline.",
        coachingRecommendation: "Use clearer impact pauses."
      },
      presenceConfidence: {
        whatIsWorking: "The speaker stays generally fluent.",
        needsImprovement: "More authority is needed at key moments.",
        coachingRecommendation: "Slow the opening and emphasize the recommendation."
      },
      bodyLanguage: {
        whatIsWorking: "There is enough visual signal for directional coaching.",
        needsImprovement: "Posture and eye line need to reinforce credibility.",
        coachingRecommendation: "Keep the camera stable and hands visible."
      },
      audienceEngagement: {
        whatIsWorking: "The content is substantial enough to hold attention.",
        needsImprovement: "Transitions need to connect more directly to audience relevance.",
        coachingRecommendation: "State the takeaway, pause, and tie it back to audience value."
      }
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
