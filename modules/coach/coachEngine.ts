import { callLLM } from "../../core/llm/client.js";
import { buildDoctrineContext } from "../../core/knowledge/tpgDoctrine.js";
import { coachResponseSchema, type CoachAttachment, type CoachDiagnosis, type CoachMessageInput, type CoachResponse } from "../../core/schemas/coach.js";
import { buildCoachPrompt } from "./prompts.js";

type CoachMessage = CoachMessageInput;

const MAX_ATTACHMENT_TEXT = 4000;

function normalizeAttachmentText(attachment: CoachAttachment): string {
  return attachment.text?.trim().slice(0, MAX_ATTACHMENT_TEXT) ?? "";
}

function getLatestUserMessage(messages: CoachMessage[]): CoachMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "user");
}

function getLatestAttachmentContext(messages: CoachMessage[]): string {
  const latestAttachmentMessage = [...messages].reverse().find(
    (message) => message.role === "user" && (message.attachments?.length ?? 0) > 0
  );

  if (!latestAttachmentMessage) {
    return "";
  }

  return (latestAttachmentMessage.attachments ?? [])
    .map((attachment) => {
      const text = normalizeAttachmentText(attachment);
      return text ? `${attachment.label} (${attachment.kind}): ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function latestUserContext(messages: CoachMessage[]): string {
  const latestUserMessage = getLatestUserMessage(messages);
  if (!latestUserMessage) {
    return "";
  }

  return latestUserMessage.content.trim();
}

type CoachDiagnosticFinding = {
  title: string;
  evidence: string;
};

const STORYBOARD_SECTION_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "Opening Gambit", pattern: /\bopening gambit\b/i },
  { label: "Desired Outcome", pattern: /\bdesired outcome\b/i },
  { label: "Situation", pattern: /\bsituation\b/i },
  { label: "Root Cause", pattern: /\broot cause\b/i },
  { label: "Big Idea", pattern: /\bbig idea\b/i },
  { label: "How It Works", pattern: /\bhow it works\b|\bnow what\b/i },
  { label: "WIIFM", pattern: /\bwiifm\b|what'?s in it for me/i },
  { label: "Close", pattern: /\bclose\b/i },
  { label: "Actions & Next Steps", pattern: /\bactions? & next steps\b|\bnext steps\b/i }
];

function sectionTextFromAttachment(text: string, sectionLabel: string): string {
  const escapedLabels = STORYBOARD_SECTION_PATTERNS.map(({ label }) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const sectionPattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\d+[a-z]?\\)\\s*)?${sectionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[\\s\\S]*?(?=(?:\\n\\s*(?:\\d+[a-z]?\\)\\s*)?(?:${escapedLabels.join("|")})\\b)|$)`,
    "i"
  );

  const match = text.match(sectionPattern);
  return match?.[0]?.trim() ?? "";
}

function getLatestAttachmentTexts(messages: CoachMessage[]): string[] {
  const latestAttachmentMessage = [...messages].reverse().find(
    (message) => message.role === "user" && (message.attachments?.length ?? 0) > 0
  );

  if (!latestAttachmentMessage) {
    return [];
  }

  return (latestAttachmentMessage.attachments ?? [])
    .map((attachment) => normalizeAttachmentText(attachment))
    .filter(Boolean);
}

function buildCoachDiagnostics(messages: CoachMessage[]): CoachDiagnosticFinding[] {
  const findings: CoachDiagnosticFinding[] = [];
  const latestUserMessage = latestUserContext(messages);
  const attachmentTexts = getLatestAttachmentTexts(messages);
  const combinedAttachmentText = attachmentTexts.join("\n\n");
  const combinedContext = [latestUserMessage, combinedAttachmentText].filter(Boolean).join("\n\n");
  const loweredContext = combinedContext.toLowerCase();

  if (!combinedContext.trim()) {
    return findings;
  }

  if (combinedAttachmentText) {
    const missingSections = STORYBOARD_SECTION_PATTERNS
      .filter(({ pattern }) => !pattern.test(combinedAttachmentText))
      .map(({ label }) => label);

    if (missingSections.length > 0 && missingSections.length <= 4) {
      findings.push({
        title: "Potential structural gaps",
        evidence: `The attached material does not clearly surface these canonical sections: ${missingSections.join(", ")}.`
      });
    }

    const openingText = sectionTextFromAttachment(combinedAttachmentText, "Opening Gambit");
    if (openingText) {
      const openingPercentCount = (openingText.match(/%/g) ?? []).length;
      const openingBulletCount = (openingText.match(/^\s*[•*-]\s+/gm) ?? []).length;
      if (openingPercentCount >= 2 || openingBulletCount >= 2 || openingText.length > 350) {
        findings.push({
          title: "Opening Gambit may be too analytical",
          evidence: "The opening appears dense, bullet-heavy, or data-heavy, which often means it is functioning as context instead of a true hook."
        });
      }
    }

    const desiredOutcomeText = sectionTextFromAttachment(combinedAttachmentText, "Desired Outcome");
    if (/\breview\b|\bdiscuss\b|\bexplore\b|\bconsider\b/i.test(desiredOutcomeText)) {
      findings.push({
        title: "Desired Outcome may be non-committal",
        evidence: "The desired outcome appears to use exploratory or discussion language rather than a singular yes, approval, or decision ask."
      });
    }

    const bigIdeaText = sectionTextFromAttachment(combinedAttachmentText, "Big Idea");
    if (bigIdeaText) {
      const hasImperativeLanguage = /\bpartner\b|\bleverage\b|\buse\b|\blaunch\b|\bbuild\b|\bcreate\b|\bposition\b|\bdeliver\b/i.test(bigIdeaText);
      const bigIdeaBulletCount = (bigIdeaText.match(/^\s*[•*-]\s+/gm) ?? []).length;
      if (hasImperativeLanguage || bigIdeaBulletCount >= 2 || bigIdeaText.length > 420) {
        findings.push({
          title: "Big Idea may be tactical instead of belief-based",
          evidence: "The Big Idea reads like features, actions, or a long explanation rather than one standalone belief shift."
        });
      }
    }

    const wiifmText = sectionTextFromAttachment(combinedAttachmentText, "WIIFM");
    if (wiifmText) {
      const hasQuantification = /%|\$|\b\d+\b/.test(wiifmText);
      const hasBusinessValueWords = /\bmargin\b|\bgrowth\b|\broi\b|\bcost\b|\bspeed\b|\bprofit\b|\bvalue\b/i.test(wiifmText);
      if (!hasQuantification && !hasBusinessValueWords) {
        findings.push({
          title: "WIIFM may lack business proof",
          evidence: "The WIIFM appears benefit-oriented but may not yet translate value into quantified or business-centered outcomes."
        });
      }
    }
  }

  if (/\bmarket trends\b|\bsales chart\b|\bcategory landscape\b|\bdesired outcome\b|\bsituation expectations\b/i.test(loweredContext)) {
    findings.push({
      title: "Possible topic-label headlines",
      evidence: "The material may contain section or topic labels instead of takeaway headlines that state what the slide says."
    });
  }

  const bulletCount = (combinedAttachmentText.match(/^\s*[•*-]\s+/gm) ?? []).length;
  if (bulletCount >= 10) {
    findings.push({
      title: "Content density risk",
      evidence: "The attached material contains many bullets, which often means too many ideas are competing and the main point will be harder to process."
    });
  }

  if (combinedAttachmentText.length > 2200 && !/\btherefore\b|\bso what\b|\bwhich means\b|\btherefore\b/i.test(loweredContext)) {
    findings.push({
      title: "Possible data-without-takeaway issue",
      evidence: "There is substantial content, but not much explicit takeaway language, so some material may be descriptive rather than persuasive."
    });
  }

  return findings.slice(0, 6);
}

function inferIssueType(input: string): CoachDiagnosis["issueType"] {
  const lowered = input.toLowerCase();
  if (lowered.includes("big idea") || lowered.includes("belief")) return "bigIdea";
  if (lowered.includes("opening") || lowered.includes("gambit") || lowered.includes("hook")) return "flow";
  if (lowered.includes("wiifm") || lowered.includes("benefit")) return "wiifm";
  if (lowered.includes("root cause") || lowered.includes("barrier") || lowered.includes("why")) return "rootCause";
  if (lowered.includes("situation") || lowered.includes("context")) return "situation";
  if (lowered.includes("close") || lowered.includes("ask") || lowered.includes("decision")) return "ask";
  if (lowered.includes("audience") || lowered.includes("director") || lowered.includes("thinker") || lowered.includes("relater") || lowered.includes("socializer")) return "audience";
  return "general";
}

function fallbackReply(messages: CoachMessage[]) {
  const latestUserMessage = latestUserContext(messages);
  const latestAttachmentContext = getLatestAttachmentContext(messages);
  const wantsBigIdea = latestUserMessage.toLowerCase().includes("big idea");
  const wantsOpeningGambit =
    latestUserMessage.toLowerCase().includes("opening") ||
    latestUserMessage.toLowerCase().includes("gambit") ||
    latestUserMessage.toLowerCase().includes("hook");
  const thinkerAudience = latestUserMessage.toLowerCase().includes("thinker");
  const doctrineContext = buildDoctrineContext([latestUserMessage, latestAttachmentContext].filter(Boolean).join("\n\n"));
  const diagnosisIssueType = inferIssueType(latestUserMessage);
  const commonHighlights = doctrineContext.relevantRules.slice(0, 3).map((rule) => ({
    title: rule.title,
    guidance: rule.rule
  }));

  return coachResponseSchema.parse({
    reply: wantsOpeningGambit
      ? [
          "For a thinker audience, the gambit should create urgency through a sharp fact pattern or tension they can immediately believe, not through hype or broad context.",
          "I’d keep it to one idea, minimal words, and a visual that makes the comparison or tension instantly legible."
        ].join(" ")
      : wantsBigIdea
      ? [
          "This case contains a strong business tension, but the Big Idea still needs to sound like a belief shift rather than a description of the problem.",
          "In TPG terms, the job of the Big Idea is to bridge insight to action. It should tell the audience what they need to believe before the recommendation feels obvious.",
          "For this case, move from 'women are intimidated by the tool crib' to a belief about what Home Depot must change to unlock conversion."
        ].join(" ")
      : "Let’s make the story more decision-oriented. In TPG terms, strengthen the Desired Outcome, isolate the root cause truth, and translate the recommendation into clear audience value.",
    diagnosis: {
      issueType: diagnosisIssueType,
      summary: wantsOpeningGambit
        ? "The ask is now narrower: you need opening-gambit options that create immediate tension for a thinker audience, not more general story diagnosis."
        : wantsBigIdea
        ? "The story tension is clear, but the recommendation has not yet been elevated into a belief-based Big Idea."
        : "The story likely needs sharper structure, a clearer ask, and stronger audience translation.",
      likelyCauses: wantsOpeningGambit
        ? [
            "The current opening likely reads as context or category setup rather than as a true hook.",
            "The user’s latest question is being overshadowed by the earlier storyboard critique.",
            "The opening may not yet be tuned to a thinker audience’s need for credible tension."
          ]
        : wantsBigIdea
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
      suggestedFixes: wantsOpeningGambit
        ? [
            "Lead with one surprising business or consumer fact instead of multiple setup points.",
            "Frame the opening around why the opportunity is urgent now, not around meeting purpose.",
            "Use a visual that makes the tension obvious in three seconds."
          ]
        : wantsBigIdea
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
    reframes: wantsOpeningGambit
      ? [
          {
            label: thinkerAudience ? "Option A · Data-led tension" : "Option A",
            text: "Consumers are paying more for health-forward products, but most ingredient partnerships still force manufacturers to trade off speed, cost, or clean-label credibility.",
            whyItWorks: "This opens with a business tension a thinker can evaluate quickly: demand is rising, but the operating model is still flawed."
          },
          {
            label: thinkerAudience ? "Option B · Why-now contrast" : "Option B",
            text: "Health demand is growing fast, yet the ingredient choices behind many launches still behave like a commodity decision instead of a growth decision.",
            whyItWorks: "This reframes the category from sourcing choice to strategic growth lever, which is a stronger entry point for the rest of the story."
          },
          {
            label: thinkerAudience ? "Option C · Executive question" : "Option C",
            text: "If consumers will pay more for health benefits, what is the cost of treating fruit and vegetable concentrates like interchangeable inputs?",
            whyItWorks: "This uses a question to create credible tension while inviting the audience to interrogate the current approach."
          }
        ]
      : wantsBigIdea
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
    suggestedQuestions: wantsOpeningGambit
      ? [
          "Which fact is strongest enough to carry the hook by itself?",
          "What is the sharpest why-now tension for this audience: margin, speed, innovation, or competitive risk?",
          "Do you want the opening to lead with a statement, a question, or a contrast?"
        ]
      : wantsBigIdea
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
    suggestedNextStep: wantsOpeningGambit
      ? "Choose one gambit direction, then rewrite the visual so it reinforces the same single tension rather than introducing extra explanation."
      : wantsBigIdea
      ? "Choose the strongest belief-shift option, then test it by asking whether it states what the audience must believe before they will support the plan."
      : "Clarify the decision, the root cause truth, and the audience benefit before refining the wording."
  });
}

export async function runCoach(messages: CoachMessage[]) {
  const latestUserMessage = latestUserContext(messages);
  const latestAttachmentContext = getLatestAttachmentContext(messages);
  const doctrineContext = buildDoctrineContext([latestUserMessage, latestAttachmentContext].filter(Boolean).join("\n\n"));
  const diagnosticFindings = buildCoachDiagnostics(messages);
  const prompt = buildCoachPrompt({
    conversation: messages.map((message) => ({
      ...message,
      attachments: (message.attachments ?? []).map((attachment) => ({
        ...attachment,
        text: normalizeAttachmentText(attachment)
      }))
    })),
    doctrineContext,
    diagnosticFindings
  });

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
