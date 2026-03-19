import type { Artifact } from "../../core/schemas/artifact.js";

export function buildEvaluatorPrompt(input: {
  videoContext: string;
  artifacts: Artifact[];
}): string {
  return [
    "Evaluate presentation delivery, not content quality.",
    "Return one JSON object with exactly these keys:",
    '{ "overallDelivery": "strong" | "mixed" | "needs work", "summary": string, "deliveryDimensions": [{ "label": string, "rating": "strong" | "mixed" | "needs work", "feedback": string, "coachingTip": string }], "keyStrengths": string[], "coachingPriorities": string[], "practiceDrills": string[], "nextStep": string }',
    "Focus on delivery dimensions such as executive presence, pace, energy, clarity, body language, vocal delivery, and audience connection.",
    "Do not evaluate story structure, slide logic, or content quality unless it directly affects delivery.",
    "Do not include markdown, code fences, or extra keys.",
    `Video context:\n${input.videoContext}`,
    `Artifacts:\n${input.artifacts
      .map((artifact) => `${artifact.label}: ${artifact.extractedText ?? artifact.visionSummary ?? "No processed content"}`)
      .join("\n")}`
  ].join("\n\n");
}
