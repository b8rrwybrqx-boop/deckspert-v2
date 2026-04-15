import { callLLM } from "../../core/llm/client.js";
import { buildDoctrineContext } from "../../core/knowledge/tpgDoctrine.js";
import {
  coachResponseSchema,
  type CoachAttachment,
  type CoachDiagnosis,
  type CoachEvaluation,
  type CoachMessageInput,
  type CoachResponse
} from "../../core/schemas/coach.js";
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

function isEvaluationIntent(message: string) {
  const lowered = message.toLowerCase();
  const evaluationSignals = /\b(evaluate|evaluation|review|assess|score|critique|audit)\b/;
  const deckSignals = /\b(deck|slides|storyboard|presentation|story|content|page[- ]by[- ]page)\b/;
  const lensSignals = /\b(compelling content|story structure|story architecture|wiifm|opening gambit|big idea|readability|visual hierarchy|title effectiveness)\b/;

  return (evaluationSignals.test(lowered) && (deckSignals.test(lowered) || lensSignals.test(lowered))) ||
    /\bevaluate this deck\b|\bevaluate this storyboard\b|\breview this deck\b|\bassess this deck\b/.test(lowered);
}

function isMetaFollowUp(message: string) {
  const lowered = message.toLowerCase().trim();
  return /\b(can you confirm|are you responding to this prompt|did you get this|did you see this|this is a test|respond to this prompt|acknowledge this prompt)\b/.test(lowered);
}

function getEvaluationFocus(message: string): "story" | "content" {
  const lowered = message.toLowerCase();
  if (/\bcompelling content\b|\bvisual hierarchy\b|\breadability\b|\btitle effectiveness\b|\bvisual appeal\b|\bsimplicity\b|\bease of understanding\b/.test(lowered)) {
    return "content";
  }

  return "story";
}

function resolveCoachModel(evaluationMode: boolean) {
  if (evaluationMode) {
    return process.env.COACH_EVAL_MODEL ?? "gpt-4.1";
  }

  return process.env.COACH_MODEL;
}

const CANONICAL_SECTION_ORDER: CoachEvaluation["sectionScores"][number]["section"][] = [
  "titleSlide",
  "openingGambit",
  "desiredOutcome",
  "situationRootCause",
  "bigIdea",
  "howItWorks",
  "wiifm",
  "close",
  "actionsNextSteps"
];

function normalizeEvaluation(response: unknown): CoachResponse {
  const parsedResponse = coachResponseSchema.parse(response);

  if (!parsedResponse.evaluation) {
    return coachResponseSchema.parse({
      ...parsedResponse,
      mode: parsedResponse.mode ?? "general"
    });
  }

  const sectionScores = CANONICAL_SECTION_ORDER
    .map((section) => parsedResponse.evaluation?.sectionScores.find((item) => item.section === section))
    .filter((item): item is NonNullable<CoachResponse["evaluation"]>["sectionScores"][number] => Boolean(item))
    .map((item) => ({
      ...item,
      rationale: item.rationale.trim(),
      strengths: item.strengths.map((entry) => entry.trim()).filter(Boolean),
      opportunities: item.opportunities.map((entry) => entry.trim()).filter(Boolean),
      toReachFive: item.toReachFive.map((entry) => entry.trim()).filter(Boolean)
    }));

  const derivedMissingOrWeak = sectionScores
    .filter((item) => item.score <= 2)
    .map((item) => item.section);

  return coachResponseSchema.parse({
    ...parsedResponse,
    mode: parsedResponse.mode ?? "evaluation",
    evaluation: {
      ...parsedResponse.evaluation,
      storyRead: {
        ...parsedResponse.evaluation.storyRead,
        summary: parsedResponse.evaluation.storyRead.summary.trim(),
        missingOrWeakSections: derivedMissingOrWeak,
        structuralObservations: parsedResponse.evaluation.storyRead.structuralObservations.map((item) => item.trim()).filter(Boolean)
      },
      sectionScores,
      slideQualityRead: {
        ...parsedResponse.evaluation.slideQualityRead,
        simplicity: parsedResponse.evaluation.slideQualityRead.simplicity.trim(),
        easeOfUnderstanding: parsedResponse.evaluation.slideQualityRead.easeOfUnderstanding.trim(),
        visualAppeal: parsedResponse.evaluation.slideQualityRead.visualAppeal.trim(),
        readability: parsedResponse.evaluation.slideQualityRead.readability.trim(),
        titleEffectiveness: parsedResponse.evaluation.slideQualityRead.titleEffectiveness.trim(),
        notableSlides: parsedResponse.evaluation.slideQualityRead.notableSlides.map((item) => item.trim()).filter(Boolean)
      },
      topPriorities: parsedResponse.evaluation.topPriorities
        .map((item) => ({ theme: item.theme.trim(), priority: item.priority.trim() }))
        .filter((item) => item.theme && item.priority)
    }
  });
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

function buildEvaluationFallback(messages: CoachMessage[], diagnosticFindings: CoachDiagnosticFinding[]): CoachResponse {
  const latestUserMessage = latestUserContext(messages);
  const evaluationFocus = getEvaluationFocus(latestUserMessage);
  const latestAttachmentText = getLatestAttachmentTexts(messages).join("\n\n");
  const lowered = `${latestUserMessage}\n${latestAttachmentText}`.toLowerCase();

  const hasOpeningGambit = /\bopening gambit\b/i.test(latestAttachmentText);
  const hasDesiredOutcome = /\bdesired outcome\b/i.test(latestAttachmentText);
  const hasBigIdea = /\bbig idea\b/i.test(latestAttachmentText);
  const hasWIIFM = /\bwiifm\b|what'?s in it for me/i.test(latestAttachmentText);
  const hasClose = /\bclose\b/i.test(latestAttachmentText);
  const hasNextSteps = /\bactions? & next steps\b|\bnext steps\b/i.test(latestAttachmentText);
  const titleLabelHeavy = /\bmarket trends\b|\boverview\b|\bagenda\b|\bbeverages\b|\bdairy\b|\bsolutions\b/i.test(lowered);
  const analyticalOpening = diagnosticFindings.some((item) => item.title === "Opening Gambit may be too analytical");

  const sectionScores: CoachEvaluation["sectionScores"] = [
    {
      section: "titleSlide",
      score: 3,
      rationale: "The title appears to orient the topic, but the meeting purpose and business reason to care are not yet fully explicit.",
      strengths: ["The deck appears to have a visible opening title or orientation slide."],
      opportunities: ["Clarify who the deck is for and what decision or outcome it is meant to support."],
      toReachFive: [
        "Make the audience, business stakes, and meeting purpose unmistakable in the opening frame.",
        "Turn the title into a takeaway that signals both what the deck is about and why the audience should care now."
      ]
    },
    {
      section: "openingGambit",
      score: analyticalOpening ? 1 : hasOpeningGambit ? 3 : 1,
      rationale: analyticalOpening
        ? "The opening appears to move directly into analytical or dense content, so it does not function as a true hook."
        : hasOpeningGambit
          ? "An opening section appears present, but the evidence suggests it may still be more informative than provocative."
          : "A clear opening hook is not visible in the supplied material.",
      strengths: analyticalOpening ? [] : hasOpeningGambit ? ["There is at least an attempt to frame the opening moment."] : [],
      opportunities: ["Make the opening earn attention before the deck moves into analysis or capability proof."],
      toReachFive: [
        "Open with one sharp hook that creates curiosity, urgency, or tension before any detailed proof appears.",
        "Keep the first persuasive moment focused on one idea the audience can grasp immediately."
      ]
    },
    {
      section: "desiredOutcome",
      score: hasDesiredOutcome ? 3 : 1,
      rationale: hasDesiredOutcome
        ? "A desired outcome appears present, but it may still need sharper decision language."
        : "The material does not clearly show what the audience is being asked to approve, align to, or do.",
      strengths: hasDesiredOutcome ? ["The deck appears to contain some statement of intended direction or ask."] : [],
      opportunities: ["State the decision or approval being requested in one clear, audience-relevant line."],
      toReachFive: [
        "Name one explicit yes, approval, or commitment the audience is being asked to make.",
        "Make the ask concrete enough that the audience can tell what changes if they agree."
      ]
    },
    {
      section: "situationRootCause",
      score: 3,
      rationale: "The deck appears to contain meaningful context and analytical material, but the root cause may not yet be translated into a sharp strategic tension.",
      strengths: ["There is enough content to establish context and business background."],
      opportunities: ["Make the causal logic more explicit so the audience sees why the issue exists, not just what is happening."],
      toReachFive: [
        "Synthesize the context into a clear root cause truth that explains the underlying barrier or tension.",
        "Connect the problem definition directly to the audience's business reality, not just category facts."
      ]
    },
    {
      section: "bigIdea",
      score: hasBigIdea ? 3 : 2,
      rationale: hasBigIdea
        ? "A Big Idea appears present, but the diagnostics suggest it may risk blending belief with plan or explanation."
        : "The deck appears to lean more on content and plan than on a standalone belief statement that reframes the issue.",
      strengths: hasBigIdea ? ["There is some attempt to articulate a central strategic idea."] : [],
      opportunities: ["Separate the belief the audience must accept from the plan used to act on it."],
      toReachFive: [
        "State one memorable belief shift that reframes the problem before any solution detail appears.",
        "Make the Big Idea strong enough that it naturally justifies the recommendation and changes how the audience thinks."
      ]
    },
    {
      section: "howItWorks",
      score: 3,
      rationale: "The deck likely contains a plan or capability section, but it may read more like content inventory than strategic operating logic.",
      strengths: ["There appears to be enough material to explain how the recommendation would work."],
      opportunities: ["Keep the plan at the level of a few clear pillars rather than a catalog of content or capabilities."],
      toReachFive: [
        "Organize the plan into a few strategic pillars with clear logic rather than a list of features or workstreams.",
        "Show how each pillar advances the Big Idea and makes the recommendation feel executable."
      ]
    },
    {
      section: "wiifm",
      score: hasWIIFM ? 3 : 2,
      rationale: hasWIIFM
        ? "Audience value is at least partially visible, though it may still need stronger translation into audience priorities."
        : "Audience benefit appears implied, but not clearly elevated as a standalone value story.",
      strengths: hasWIIFM ? ["The deck appears to include some benefit-oriented language."] : [],
      opportunities: ["Translate the plan into value the audience would actually care about, not just internal or supplier benefits."],
      toReachFive: [
        "Make the benefit explicit in the audience's language, including what improves for them personally or functionally.",
        "Tie the recommendation to business outcomes or proof that makes yes feel smart and safe."
      ]
    },
    {
      section: "close",
      score: hasClose ? 3 : 1,
      rationale: hasClose
        ? "A closing moment appears present, but it may still need to reinforce the recommendation more forcefully."
        : "A clear persuasive close is not visible in the supplied material.",
      strengths: hasClose ? ["The deck appears to attempt an ending or summary moment."] : [],
      opportunities: ["End by restating the recommendation and asking for alignment, not just by running out of content."],
      toReachFive: [
        "Close with a decisive restatement of the recommendation, the stakes, and the reason to act now.",
        "Make the final moment feel like an alignment point rather than a summary or fade-out."
      ]
    },
    {
      section: "actionsNextSteps",
      score: hasNextSteps ? 3 : 1,
      rationale: hasNextSteps
        ? "Next steps appear to be present, but owners, timing, or accountability may still need sharpening."
        : "Clear follow-up actions, owners, or timing are not visible.",
      strengths: hasNextSteps ? ["There appears to be at least some action-oriented follow-through."] : [],
      opportunities: ["Make the follow-up path concrete enough that the audience knows what happens after the meeting."],
      toReachFive: [
        "Define the next steps with clear actions, ownership, and timing.",
        "Make the path forward specific enough that the audience can see how agreement becomes action."
      ]
    }
  ];

  return coachResponseSchema.parse({
    mode: "evaluation",
    reply:
      "Here’s the structured evaluation read. The deck appears to have useful content, but the story likely needs a stronger spine around the ask, the belief shift, and the audience value translation.",
    evaluation: {
      storyRead: {
        summary:
          "The deck appears to contain meaningful content and some story components, but the overall flow is likely stronger on information than on persuasion.",
        followsKnowBelieveDo:
          sectionScores.find((item) => item.section === "bigIdea")?.score && hasDesiredOutcome && hasClose ? "partially" : "no",
        missingOrWeakSections: sectionScores.filter((item) => item.score <= 2).map((item) => item.section),
        structuralObservations: diagnosticFindings.slice(0, 4).map((item) => item.evidence)
      },
      sectionScores,
      slideQualityRead: {
        simplicity:
          evaluationFocus === "content"
            ? "Slide simplicity appears inconsistent. Some pages likely land one main point, but others seem to accumulate too much proof, product detail, or capability language for the audience to process quickly."
            : "The deck likely has enough content to make density and competing messages a recurring risk, especially where capability or evidence slides accumulate.",
        easeOfUnderstanding:
          evaluationFocus === "content"
            ? "Ease of understanding is probably strongest on straightforward context slides and weaker where the deck shifts from insight into product inventory or exploratory material without a sharp takeaway."
            : "Understanding is probably strongest where the slides are clearly framed, and weaker where the deck shifts into descriptive or exploratory content without a sharp takeaway.",
        visualAppeal:
          "Visual quality should only be judged cautiously from extracted content. The stronger signal here is whether the material reads cleanly, prioritizes one message, and supports fast comprehension.",
        readability:
          evaluationFocus === "content"
            ? "Readability risk appears tied more to density and hierarchy than to typography alone. Where multiple bullets, long labels, or packed proof points cluster together, the scan path weakens."
            : "Readability likely varies with slide density. Where multiple bullets or ideas cluster together, the scan path will weaken.",
        titleEffectiveness: titleLabelHeavy
          ? "Topic-label titling appears to be a recurring risk, which weakens immediate comprehension and makes the deck feel more descriptive than persuasive."
          : "Title effectiveness will depend on whether the slides consistently state what they say rather than what they are.",
        notableSlides: []
      },
      topPriorities: [
        ...(evaluationFocus === "content"
          ? [
              { theme: "Content Hierarchy", priority: "Reduce the amount of proof, product detail, or descriptive language competing on the same slides so the main message lands faster." },
              { theme: "Titles", priority: "Move more headings from topic labels to takeaway headlines so the audience can understand the point before reading the body copy." },
              { theme: "Scanability", priority: "Simplify dense slides so the audience can see one main idea, one supporting proof set, and one clear implication." },
              { theme: "Audience Impact", priority: "Turn exploratory or descriptive content into clearer messages that explain why the material matters to the audience." }
            ]
          : [
              { theme: "Story Structure", priority: "Clarify the decision or ask much earlier and more explicitly." },
              { theme: "Big Idea", priority: "Separate the belief shift from the plan so the audience sees the strategic bridge, not just the content inventory." },
              { theme: "WIIFM", priority: "Translate the recommendation into clearer audience value rather than leaving benefits implied." },
              { theme: "Close", priority: "End with a real alignment moment and visible next-step accountability." }
            ])
      ]
    },
    reframes: [],
    doctrineHighlights: [],
    suggestedQuestions: [
      "Do you want the evaluation to stay high-level, or should it go section by section?",
      "Do you want me to focus more on story structure or more on compelling content?",
      "Should I stay in evaluation mode, or switch into rewrite mode next?"
    ],
    suggestedNextStep: "Use this evaluation to identify the one structural fix that matters most before rewriting any individual slides."
  });
}

function fallbackReply(messages: CoachMessage[], diagnosticFindings: CoachDiagnosticFinding[] = []) {
  const latestUserMessage = latestUserContext(messages);
  if (isMetaFollowUp(latestUserMessage)) {
    return coachResponseSchema.parse({
      mode: "general",
      reply: "Yes. I’m responding to your latest prompt directly. If you want, we can use this as a quick follow-up test or switch back into deck evaluation with the Kerr deck as context.",
      reframes: [],
      doctrineHighlights: [],
      suggestedQuestions: [
        "Do you want me to confirm prompt handling only, or should I answer a real follow-up question next?",
        "Do you want the next response to stay in evaluation mode or switch into rewrite mode?"
      ],
      suggestedNextStep: "Send the exact follow-up behavior you want to test, and I’ll answer that prompt directly."
    });
  }

  if (isEvaluationIntent(latestUserMessage)) {
    return buildEvaluationFallback(messages, diagnosticFindings);
  }

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
    mode: "general",
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
  const evaluationMode = isEvaluationIntent(latestUserMessage);
  const evaluationFocus = evaluationMode ? getEvaluationFocus(latestUserMessage) : undefined;
  const model = resolveCoachModel(evaluationMode);
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
    diagnosticFindings,
    evaluationMode,
    evaluationFocus
  });

  try {
    const response = await callLLM(prompt, {
      schema: coachResponseSchema,
      model,
      fallback: () => fallbackReply(messages, diagnosticFindings)
    });
    return normalizeEvaluation(response);
  } catch (error) {
    console.warn("[Deckspert][Coach] Falling back after LLM error", {
      error: error instanceof Error ? error.message : error
    });
    return normalizeEvaluation(fallbackReply(messages, diagnosticFindings));
  }
}
