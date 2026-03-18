import { callLLM } from "../../core/llm/client";
import { evaluationResponseSchema } from "../../core/schemas/evaluation";
import type { Artifact } from "../../core/schemas/artifact";
import { buildEvaluatorPrompt } from "./prompts";

type DeliveryEvaluationInput = {
  videoName?: string;
  transcript?: string;
  notes?: string;
  artifacts: Artifact[];
};

function summarizeContext(input: DeliveryEvaluationInput): string {
  return [
    input.videoName ? `Video: ${input.videoName}` : "",
    input.notes ? `User notes: ${input.notes}` : "",
    input.transcript ? `Transcript or speaker notes: ${input.transcript}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function evaluateDelivery(input: DeliveryEvaluationInput) {
  const videoContext = summarizeContext(input);
  const prompt = buildEvaluatorPrompt({
    videoContext,
    artifacts: input.artifacts
  });

  return callLLM(prompt, {
    schema: evaluationResponseSchema,
    fallback: () => ({
      overallDelivery: input.transcript ? "mixed" : "needs work",
      summary:
        "The delivery has the foundation of a business presentation, but it needs clearer executive presence, stronger vocal contrast, and more deliberate audience connection.",
      deliveryDimensions: [
        {
          label: "Executive Presence",
          rating: "mixed",
          feedback: "The speaker appears credible, but the recommendation needs to land with more authority and control.",
          coachingTip: "Slow the opening, lower vocal pitch slightly, and deliver key recommendation lines as statements rather than explanations."
        },
        {
          label: "Pace and Clarity",
          rating: "mixed",
          feedback: "The message can feel rushed when too many ideas are pushed together.",
          coachingTip: "Insert short pauses after the business problem, the recommendation, and the ask."
        },
        {
          label: "Energy and Engagement",
          rating: "needs work",
          feedback: "Energy may read as flat unless key moments are emphasized with more contrast.",
          coachingTip: "Mark three moments in the talk where you intentionally increase energy, eye contact, and emphasis."
        },
        {
          label: "Audience Connection",
          rating: "mixed",
          feedback: "The audience benefit is present, but it does not consistently feel directed at the listener.",
          coachingTip: "Use more direct audience framing such as 'for Home Depot, this means...' or 'the decision in front of you is...'."
        }
      ],
      keyStrengths: [
        "The business challenge is recognizable and commercially relevant.",
        "The core ask can be shaped into a clear executive recommendation."
      ],
      coachingPriorities: [
        "Make the opening sound more confident and less explanatory.",
        "Create more vocal contrast around the shopper barrier and the business upside.",
        "Use pauses and emphasis so the recommendation lands cleanly."
      ],
      practiceDrills: [
        "Record a 60-second opening and remove filler words.",
        "Practice the recommendation line three times with a pause before and after it.",
        "Rehearse while standing and mark where eye contact and gesture emphasis should increase."
      ],
      nextStep: "Upload or paste a rough transcript and rehearse the opening plus recommendation twice, focusing only on pace, pauses, and authority."
    })
  });
}
