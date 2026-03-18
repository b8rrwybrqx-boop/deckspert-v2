import { callLLM } from "../../core/llm/client";
import { buildDoctrineContext } from "../../core/knowledge/tpgDoctrine";
import { coachResponseSchema, type CoachDiagnosis, type CoachResponse } from "../../core/schemas/coach";
import { buildCoachPrompt } from "./prompts";

type CoachMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function inferIssueType(input: string): CoachDiagnosis["issueType"] {
  const lowered = input.toLowerCase();
  if (lowered.includes("big idea") || lowered.includes("belief")) return "bigIdea";
  if (lowered.includes("wiifm") || lowered.includes("benefit")) return "wiifm";
  if (lowered.includes("root cause") || lowered.includes("barrier") || lowered.includes("why")) return "rootCause";
  if (lowered.includes("situation") || lowered.includes("context")) return "situation";
  if (lowered.includes("close") || lowered.includes("ask") || lowered.includes("decision")) return "ask";
  if (lowered.includes("audience") || lowered.includes("director") || lowered.includes("thinker") || lowered.includes("relater") || lowered.includes("socializer")) return "audience";
  return "general";
}

function fallbackReply(messages: CoachMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const wantsBigIdea = latestUserMessage.toLowerCase().includes("big idea");
  const doctrineContext = buildDoctrineContext(latestUserMessage);
  const diagnosisIssueType = inferIssueType(latestUserMessage);
  const commonHighlights = doctrineContext.relevantRules.slice(0, 3).map((rule) => ({
    title: rule.title,
    guidance: rule.rule
  }));

  return coachResponseSchema.parse({
    reply: wantsBigIdea
      ? [
          "This case contains a strong business tension, but the Big Idea still needs to sound like a belief shift rather than a description of the problem.",
          "In TPG terms, the job of the Big Idea is to bridge insight to action. It should tell the audience what they need to believe before the recommendation feels obvious.",
          "For this case, move from 'women are intimidated by the tool crib' to a belief about what Home Depot must change to unlock conversion."
        ].join(" ")
      : "Let’s make the story more decision-oriented. In TPG terms, strengthen the Desired Outcome, isolate the root cause truth, and translate the recommendation into clear audience value.",
    diagnosis: {
      issueType: diagnosisIssueType,
      summary: wantsBigIdea
        ? "The story tension is clear, but the recommendation has not yet been elevated into a belief-based Big Idea."
        : "The story likely needs sharper structure, a clearer ask, and stronger audience translation.",
      likelyCauses: wantsBigIdea
        ? [
            "The current framing is still describing the problem rather than the belief the audience must accept.",
            "The language leans tactical instead of strategic.",
            "The user has not fully translated root cause into a decision-worthy recommendation."
          ]
        : [
            "The audience and decision may not be explicit enough.",
            "The ask may not yet feel low-risk and high-value.",
            "The story may still be informative rather than persuasive."
          ],
      suggestedFixes: wantsBigIdea
        ? [
            "State the outcome first, then express what must change to achieve it.",
            "Use a belief pattern such as 'To achieve X, we must Y.'",
            "Keep the idea high-level enough to guide tactics instead of naming tactics directly."
          ]
        : [
            "Clarify the Desired Outcome early.",
            "Name the root cause truth before introducing the solution.",
            "Translate benefits in audience terms so yes feels smart and safe."
          ]
    },
    reframes: wantsBigIdea
      ? [
          {
            label: "Belief-shift option A",
            text: "To win more women in power tools, Home Depot must stop treating assortment as the answer and start removing the in-store intimidation barrier.",
            whyItWorks: "This works in TPG terms because it converts the shopper barrier into a strategic belief, not just a symptom or tactic."
          },
          {
            label: "Belief-shift option B",
            text: "If Home Depot wants to convert more women tool shoppers, it must redesign the first moments of the aisle experience to build confidence, not just stock the right brands.",
            whyItWorks: "This ties the desired business outcome to the root cause truth and reframes the recommendation around what the audience must believe."
          },
          {
            label: "Belief-shift option C",
            text: "To unlock growth with women in power tools, Home Depot must make the aisle feel approachable at shelf, not just competitive on assortment.",
            whyItWorks: "This is concise, belief-based, and memorable, while still pointing toward the plan without collapsing into tactics."
          }
        ]
      : [],
    doctrineHighlights: commonHighlights,
    suggestedQuestions: wantsBigIdea
      ? [
          "What decision do you need from the audience?",
          "What specific barrier is the real root cause: intimidation, navigation, confidence, or service design?",
          "What benefit lands for Home Depot if this barrier is removed?"
        ]
      : [
          "Who is the audience and what do they care about most?",
          "What is the current situation and why is it not good enough?",
          "What do you want them to do next?"
        ],
    suggestedNextStep: wantsBigIdea
      ? "Choose the strongest belief-shift option, then test it by asking whether it states what the audience must believe before they will support the plan."
      : "Clarify the decision, the root cause truth, and the audience benefit before refining the wording."
  });
}

export async function runCoach(messages: CoachMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const doctrineContext = buildDoctrineContext(latestUserMessage);
  const prompt = buildCoachPrompt({ conversation: messages, doctrineContext });

  try {
    return await callLLM(prompt, {
      schema: coachResponseSchema,
      fallback: () => fallbackReply(messages)
    });
  } catch (error) {
    console.warn("[Deckspert][Coach] Falling back after LLM error", {
      error: error instanceof Error ? error.message : error
    });
    return fallbackReply(messages);
  }
}
