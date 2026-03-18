import type { CoachResponse } from "../../core/schemas/coach";

export function buildCoachPrompt(input: {
  conversation: Array<{ role: string; content: string }>;
  doctrineContext: {
    relevantRules: Array<{ title: string; rule: string }>;
    behaviorStyle: {
      style: string;
      description: string;
      communication_rules: string[];
      what_they_need: string[];
    } | null;
    explanationHighlights: Array<{ topic: string; guidance: string }>;
  };
}): string {
  const responseShape: Record<keyof CoachResponse, string> = {
    reply: "string",
    diagnosis: '{ "issueType": "bigIdea" | "situation" | "rootCause" | "wiifm" | "ask" | "flow" | "audience" | "general", "summary": string, "likelyCauses": string[], "suggestedFixes": string[] } | undefined',
    reframes: '[{ "label": string, "text": string, "whyItWorks": string }]',
    doctrineHighlights: '[{ "title": string, "guidance": string }]',
    suggestedQuestions: "string[]",
    suggestedNextStep: "string | undefined"
  };

  return [
    "Act as Deckspert Storytelling Coach, sounding like a TPG storytelling expert.",
    "Be specific, constructive, collaborative, and deeply grounded in TPG storytelling doctrine.",
    "Use TPG language naturally, including concepts like belief shift, root cause truth, WIIFM, Desired Outcome, Big Idea, and making yes feel safe when relevant.",
    "Return one JSON object with exactly these keys:",
    JSON.stringify(responseShape),
    "Do not include markdown, code fences, or extra keys.",
    "The reply should be substantive and useful, not brief. It should explain the problem, coach the user, and if relevant provide candidate rewrites or Big Idea options.",
    "Use reframes when the user asks for rewrites, Big Ideas, openings, WIIFM, or stronger phrasing.",
    "Use doctrineHighlights to summarize the most relevant TPG principles behind the advice.",
    "Do not assume the user has shared a draft unless they explicitly provided draft language or asked for feedback on draft content.",
    "If the user is asking for help constructing something from scratch, refer to the case, story, question, or situation, not to a draft.",
    "If the audience style is apparent, adapt recommendations to that audience.",
    "If the user asks why something works, explain it in TPG terms rather than generic writing advice.",
    `Relevant doctrine:\n${input.doctrineContext.relevantRules.map((rule) => `- ${rule.title}: ${rule.rule}`).join("\n")}`,
    input.doctrineContext.behaviorStyle
      ? `Behavioral style guidance:\n- ${input.doctrineContext.behaviorStyle.style}: ${input.doctrineContext.behaviorStyle.description}\n- Communication rules: ${input.doctrineContext.behaviorStyle.communication_rules.join("; ")}\n- What they need: ${input.doctrineContext.behaviorStyle.what_they_need.join("; ")}`
      : "Behavioral style guidance:\n- No explicit style detected. Use balanced executive guidance unless the user implies otherwise.",
    `TPG explanation voice:\n${input.doctrineContext.explanationHighlights.map((item) => `- ${item.topic}: ${item.guidance}`).join("\n")}`,
    "Conversation:",
    JSON.stringify(input.conversation)
  ].join("\n\n");
}
