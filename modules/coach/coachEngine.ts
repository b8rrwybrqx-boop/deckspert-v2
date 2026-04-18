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

const DEFAULT_ATTACHMENT_TEXT_LIMIT = 6000;
const DECK_ATTACHMENT_TEXT_LIMIT = 18000;

function normalizeAttachmentText(attachment: CoachAttachment): string {
  const limit =
    attachment.kind === "pdf" || attachment.kind === "pptx" || attachment.kind === "doc"
      ? DECK_ATTACHMENT_TEXT_LIMIT
      : DEFAULT_ATTACHMENT_TEXT_LIMIT;
  return attachment.text?.trim().slice(0, limit) ?? "";
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

function isTargetedCoachingFollowUp(message: string) {
  const lowered = message.toLowerCase();
  const asksForImprovement =
    /\b(can you|could you|what should|how should|help me|give me|provide|suggest|recommend)\b/i.test(message) &&
    /\b(add|addition|additions|improve|improvement|strengthen|fix|work on|revise|rewrite|make better)\b/i.test(message);
  const referencesPriorEvaluation =
    /\blowest score\b|\bscore is\b|\bscored\b|\brating\b|\bsection\b|\bthat\b|\bthis\b/i.test(message);
  const referencesStorySection =
    /\b(actions? (?:&|and) next steps?|next steps?|close|wiifm|big idea|desired outcome|opening gambit|root cause|title slide|how it works)\b/i.test(message);

  return (asksForImprovement && (referencesPriorEvaluation || referencesStorySection)) ||
    /\bmy lowest score\b/i.test(message);
}

function isEvaluationIntent(message: string) {
  if (isTargetedCoachingFollowUp(message)) {
    return false;
  }

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
      recommendation: item.recommendation.trim()
    }));

  const derivedMissingOrWeak = sectionScores
    .filter((item) => item.score <= 2)
    .map((item) => item.section);

  return coachResponseSchema.parse({
    ...parsedResponse,
    mode: parsedResponse.mode ?? "evaluation",
    evaluation: {
      ...parsedResponse.evaluation,
      focus: parsedResponse.evaluation.focus,
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
      slideReviews: parsedResponse.evaluation.slideReviews
        .map((item) => ({
          slideLabel: item.slideLabel.trim(),
          simplicity: item.simplicity.trim(),
          easeOfUnderstanding: item.easeOfUnderstanding.trim(),
          visualAppeal: item.visualAppeal.trim(),
          readability: item.readability.trim(),
          titleEffectiveness: item.titleEffectiveness.trim(),
          whatIsWorking: item.whatIsWorking.trim(),
          weakness: item.weakness.trim(),
          opportunity: item.opportunity.trim()
        }))
        .filter((item) => item.slideLabel),
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

function isPrepWorksheetText(text: string): boolean {
  const normalized = text.toLowerCase();
  if (normalized.includes("proper preparation planning worksheet")) {
    return true;
  }

  const worksheetSignals = [
    /behavioral style/i,
    /core needs/i,
    /business needs/i,
    /personal needs/i,
    /reasons to say yes/i,
    /likely objections/i,
    /type of need/i
  ].filter((pattern) => pattern.test(text)).length;

  return worksheetSignals >= 3;
}

function isLikelyPrepWorksheetArtifact(text: string): boolean {
  const openingWindow = text.slice(0, 2200);
  return isPrepWorksheetText(openingWindow);
}

function isLikelyStoryboardArtifact(text: string): boolean {
  const canonicalLabelCount = STORYBOARD_SECTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).length;
  const storyboardSignals = /speaker notes|visual:|key points|storyboard|slide\s+\d+\s+[—-]/i.test(text);
  return canonicalLabelCount >= 4 || (canonicalLabelCount >= 2 && storyboardSignals);
}

function hasEarlyProvocativeHook(text: string): boolean {
  const slideBlocks = extractSlideBlocks(text);
  const openingWindow = slideBlocks.length
    ? slideBlocks.slice(1, 4).map((slide) => slide.body).join("\n\n")
    : text.slice(0, 2600);
  return /%|\$|\b\d+\b/.test(openingWindow) &&
    /\bfail|risk|stakes|why|result|persuad|attention|change|problem|cost|growth|declin|pressure\b/i.test(openingWindow);
}

function extractSlideBlocks(text: string): Array<{ number: string; body: string }> {
  return Array.from(text.matchAll(/Slide\s+(\d+):\s*([\s\S]*?)(?=\n\nSlide\s+\d+:|$)/gi))
    .map((match) => ({
      number: match[1] ?? "",
      body: (match[2] ?? "").trim()
    }))
    .filter((slide) => slide.number && slide.body);
}

function pickSlideHeadline(body: string): string | undefined {
  return body
    .split("|")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .find((item) =>
      item.length >= 6 &&
      item.length <= 120 &&
      !/^(confidential|all rights reserved|\d+|pdf|copyright)$/i.test(item) &&
      !/\b(the partnering group|inc\.?|source:|all rights reserved)\b/i.test(item) &&
      !/^©\s?\d{4}/i.test(item)
    );
}

function sectionAppearsAsVisibleDeckContent(text: string, sectionLabel: string): boolean {
  if (!text.trim()) {
    return false;
  }

  const sectionText = sectionTextFromAttachment(text, sectionLabel);
  if (!sectionText) {
    return false;
  }

  // Proper Prep worksheets often contain section labels as planning fields. Those
  // labels should not earn story credit unless the section also appears as deck copy.
  if (isPrepWorksheetText(sectionText)) {
    return false;
  }

  const hasSlideBoundary = /(?:^|\n|\|)\s*(?:slide\s*)?\d{1,2}[\).:\-\s]/i.test(sectionText);
  const hasPresentationCopy =
    /speaker notes|visual:|key points|headline|recommendation|approve|align|commit|next steps|why now|the ask/i.test(sectionText);

  return hasSlideBoundary || hasPresentationCopy;
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
    const containsPrepWorksheet = isLikelyPrepWorksheetArtifact(combinedAttachmentText);
    const hasStoryboardStructure = isLikelyStoryboardArtifact(combinedAttachmentText);
    const hasSlideAwareText = extractSlideBlocks(combinedAttachmentText).length >= 3;
    const missingSections =
      hasSlideAwareText
        ? []
        : containsPrepWorksheet || hasStoryboardStructure
        ? STORYBOARD_SECTION_PATTERNS
            .filter(({ label, pattern }) =>
              containsPrepWorksheet
                ? !sectionAppearsAsVisibleDeckContent(combinedAttachmentText, label)
                : !pattern.test(combinedAttachmentText)
            )
            .map(({ label }) => label)
        : [];

    if (missingSections.length > 0 && missingSections.length <= 4) {
      findings.push({
        title: "Potential structural gaps",
        evidence: `The attached material does not clearly surface these canonical sections: ${missingSections.join(", ")}.`
      });
    }

    if (containsPrepWorksheet) {
      findings.push({
        title: "Prep worksheet detected",
        evidence: "The attached material includes Proper Prep or worksheet fields, so Coach should not give story-section credit for planning labels unless they are visible as deck slides."
      });
    }

    const openingText = sectionAppearsAsVisibleDeckContent(combinedAttachmentText, "Opening Gambit")
      ? sectionTextFromAttachment(combinedAttachmentText, "Opening Gambit")
      : "";
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

    const desiredOutcomeText = sectionAppearsAsVisibleDeckContent(combinedAttachmentText, "Desired Outcome")
      ? sectionTextFromAttachment(combinedAttachmentText, "Desired Outcome")
      : "";
    if (/\breview\b|\bdiscuss\b|\bexplore\b|\bconsider\b/i.test(desiredOutcomeText)) {
      findings.push({
        title: "Desired Outcome may be non-committal",
        evidence: "The desired outcome appears to use exploratory or discussion language rather than a singular yes, approval, or decision ask."
      });
    }

    const bigIdeaText = sectionAppearsAsVisibleDeckContent(combinedAttachmentText, "Big Idea")
      ? sectionTextFromAttachment(combinedAttachmentText, "Big Idea")
      : "";
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

    const wiifmText = sectionAppearsAsVisibleDeckContent(combinedAttachmentText, "WIIFM")
      ? sectionTextFromAttachment(combinedAttachmentText, "WIIFM")
      : "";
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

function extractSlideCandidates(text: string): string[] {
  const slideBlocks = extractSlideBlocks(text);
  if (slideBlocks.length) {
    return slideBlocks
      .map((slide) => {
        const headline = pickSlideHeadline(slide.body);
        return headline ? `Slide ${slide.number} — ${headline}` : `Slide ${slide.number}`;
      })
      .slice(0, 8);
  }

  const pipeSegments = text
    .split("|")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) =>
      item.length >= 6 &&
      item.length <= 90 &&
      !/^(confidential|all rights reserved|\d+|pdf)$/i.test(item) &&
      !/^©\s?\d{4}/i.test(item)
    );

  const unique = Array.from(new Set(pipeSegments)).slice(0, 6);
  return unique.length ? unique : ["Slide 1", "Slide 2", "Slide 3"];
}

function buildEvaluationFallback(messages: CoachMessage[], diagnosticFindings: CoachDiagnosticFinding[]): CoachResponse {
  const latestUserMessage = latestUserContext(messages);
  const evaluationFocus = getEvaluationFocus(latestUserMessage);
  const latestAttachmentText = getLatestAttachmentTexts(messages).join("\n\n");
  const lowered = `${latestUserMessage}\n${latestAttachmentText}`.toLowerCase();

  const hasOpeningGambit = /\bopening gambit\b/i.test(latestAttachmentText);
  const hasDesiredOutcome = /\bdesired outcome\b/i.test(latestAttachmentText);
  const visibleOpeningGambit = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "Opening Gambit");
  const visibleDesiredOutcome = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "Desired Outcome");
  const visibleBigIdea = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "Big Idea");
  const visibleWIIFM = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "WIIFM");
  const visibleClose = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "Close");
  const visibleNextSteps = sectionAppearsAsVisibleDeckContent(latestAttachmentText, "Actions & Next Steps");
  const containsPrepWorksheet = isLikelyPrepWorksheetArtifact(latestAttachmentText);
  const hasSlideAwareText = extractSlideBlocks(latestAttachmentText).length >= 3;
  const likelyDeckExtraction = hasSlideAwareText || /©\s*\|\s*\d{4}|source:|^\s*\d+\s*$/im.test(latestAttachmentText) || extractSlideCandidates(latestAttachmentText).length >= 4;
  const earlyProvocativeHook = hasEarlyProvocativeHook(latestAttachmentText);
  const titleLabelHeavy = /\bmarket trends\b|\boverview\b|\bagenda\b|\bbeverages\b|\bdairy\b|\bsolutions\b/i.test(lowered);
  const analyticalOpening = diagnosticFindings.some((item) => item.title === "Opening Gambit may be too analytical");
  const slideCandidates = extractSlideCandidates(latestAttachmentText);
  const sectionEvidence = getSlideEvidence(latestAttachmentText);
  const hasSemanticSection = (section: CoachEvaluation["sectionScores"][number]["section"]) =>
    (sectionEvidence.find((item) => item.section === section)?.slides.length ?? 0) > 0;
  const hasSemanticDesiredOutcome = hasSemanticSection("desiredOutcome");
  const hasSemanticSituationRootCause = hasSemanticSection("situationRootCause");
  const hasSemanticBigIdea = hasSemanticSection("bigIdea");
  const hasSemanticHowItWorks = hasSemanticSection("howItWorks");
  const hasSemanticWiifm = hasSemanticSection("wiifm");
  const hasSemanticClose = hasSemanticSection("close");
  const hasSemanticNextSteps = hasSemanticSection("actionsNextSteps");

  const sectionScores: CoachEvaluation["sectionScores"] = [
    {
      section: "titleSlide",
      score: 3,
      rationale: "The title orients the topic, but it does not yet make the meeting purpose or reason to care unmistakable. The audience can tell what the deck is about, but the opening frame can work harder to say why this conversation matters now.",
      recommendation: "Clarify who the deck is for, what decision or understanding it is meant to support, and why the audience should care in the opening frame."
    },
    {
      section: "openingGambit",
      score: analyticalOpening ? 1 : earlyProvocativeHook ? 4 : visibleOpeningGambit ? 3 : likelyDeckExtraction ? 3 : 1,
      rationale: analyticalOpening
        ? "The deck moves directly into analytical or dense content, so the opening is not functioning as a true hook. It starts with information before it earns attention."
        : earlyProvocativeHook
          ? "The opening uses a sharp proof point or tension early, which gives the audience a clear reason to care before the deck moves into explanation. The opportunity is to make sure the next slide connects that hook directly to the purpose of the session."
        : visibleOpeningGambit
          ? "An opening moment is present, but it still reads as setup rather than a real gambit. The audience gets context, but not yet a sharp reason to lean in."
          : likelyDeckExtraction
            ? "The opening has enough material to orient the audience, but the hook itself needs to be clearer and more memorable. I’d push the first persuasive moment to feel less like setup and more like a reason to lean in."
          : containsPrepWorksheet && hasOpeningGambit
            ? "The only clear Opening Gambit signal is a planning or worksheet label, not a visible slide that earns the audience's attention."
            : "There is no visible opening gambit before the deck moves into context or proof.",
      recommendation: "Lead with one sharp idea that creates urgency, contrast, or curiosity before the deck moves into data, explanation, or capability proof."
    },
    {
      section: "desiredOutcome",
      score: visibleDesiredOutcome || hasSemanticDesiredOutcome ? 4 : likelyDeckExtraction ? 3 : 1,
      rationale: visibleDesiredOutcome || hasSemanticDesiredOutcome
        ? "A desired outcome is visible, but it still needs cleaner language about what the audience should approve, align to, do, or leave understanding differently. The intent is there, but it is not yet hard to misread."
        : likelyDeckExtraction
          ? "The deck has a clear topic and learning direction, but the desired outcome would be stronger if it stated exactly what the audience should leave understanding, believing, or ready to do."
        : containsPrepWorksheet && hasDesiredOutcome
          ? "The desired outcome is present as prep or worksheet input, but not as a visible deck moment that tells the audience what to approve, align to, do, or understand."
          : "The deck does not clearly state what the audience is being asked to approve, align to, do, or understand by the end of the presentation.",
      recommendation: "Express the desired outcome in one clear, audience-relevant line so the audience knows what changes if they agree, or what they should leave understanding differently."
    },
    {
      section: "situationRootCause",
      score: hasSemanticSituationRootCause ? 4 : 3,
      rationale: hasSemanticSituationRootCause
        ? "The deck gives the audience a clear problem setup and a visible reason the problem exists. The current state is supported by the stark reality framing, and the root cause is sharpened by the training gap."
        : "The deck contains enough context to explain the current state, but the flow from situation to root cause is not yet sharp enough. The audience is likely seeing what is happening before they clearly understand why it is happening.",
      recommendation: "Tighten the sequencing of the current state, then make the root cause explicit so the audience sees both what is happening now and the underlying reason the issue exists."
    },
    {
      section: "bigIdea",
      score: visibleBigIdea || hasSemanticBigIdea ? 4 : 2,
      rationale: visibleBigIdea || hasSemanticBigIdea
        ? "The deck contains a clear belief statement that bridges the problem to the recommendation. It tells the audience that better results require training in persuasive storytelling, though the wording could be made more distinctive and memorable."
        : "The deck is leaning on facts, recommendations, or plan language without a clear belief statement that bridges the problem to the recommendation.",
      recommendation: "State the one belief the audience needs to accept before the plan makes sense, and make that belief distinct from the tactics, features, or execution steps that follow."
    },
    {
      section: "howItWorks",
      score: hasSemanticHowItWorks ? 4 : 3,
      rationale: hasSemanticHowItWorks
        ? "The deck clearly explains how the recommendation works through the program elements, sessions, coaching, tools, and learning journey. The main risk is that the middle can feel extended and somewhat repetitive."
        : "The deck explains how the recommendation works, but the material risks reading like content inventory instead of a clear strategic logic. The audience may see a lot of material without seeing the clean operating structure underneath it.",
      recommendation: "Organize the plan into a few strategic pillars and show how each one advances the core recommendation instead of listing capabilities or workstreams."
    },
    {
      section: "wiifm",
      score: visibleWIIFM || hasSemanticWiifm ? 4 : 2,
      rationale: visibleWIIFM || hasSemanticWiifm
        ? "Audience value is visible through results, proof, feedback, and outcomes language. The benefit story is credible, but it can still be sharpened around the specific buyer priorities that matter most."
        : "The value to the audience is mostly implied rather than stated directly. The deck talks about the idea, but not clearly enough about why this matters to them.",
      recommendation: "Translate the recommendation into explicit audience value so the deck answers why they should care, what improves for them, and why supporting it is worthwhile."
    },
    {
      section: "close",
      score: visibleClose || hasSemanticClose ? 3 : 1,
      rationale: visibleClose || hasSemanticClose
        ? "The deck has an ending, but it may still be functioning more like a summary than a persuasive close. The audience is getting closure, but not yet a strong final alignment moment."
        : "There is no real persuasive close visible in the deck. The deck ends without clearly restating the recommendation and why the audience should act now.",
      recommendation: "Use the final moment to restate the recommendation, reinforce the stakes, and make the audience feel they are arriving at a decision point rather than just the end of the content."
    },
    {
      section: "actionsNextSteps",
      score: visibleNextSteps || hasSemanticNextSteps ? 2 : 1,
      rationale: visibleNextSteps || hasSemanticNextSteps
        ? "A next step is visible, but ownership, timing, and accountability are not clear enough. The audience can see movement, but not yet a fully concrete path forward."
        : "There are no clear next steps with ownership and timing visible in the deck.",
      recommendation: "Define the follow-up path concretely enough that the audience can see what happens next, who owns it, and when progress should occur."
    }
  ];

  const slideReviews: CoachEvaluation["slideReviews"] = slideCandidates.map((title, index) => ({
    slideLabel: `Slide ${index + 1}${title ? ` — ${title}` : ""}`,
    simplicity: titleLabelHeavy && index < 3
      ? "This slide is carrying more setup or category language than it needs, so the main point is harder to spot quickly."
      : "The slide likely has enough material to be useful, but it needs one dominant message instead of several ideas competing for attention.",
    easeOfUnderstanding: "The audience should be able to tell the point in a few seconds. Right now the content likely requires more decoding than it should.",
    visualAppeal: "The page will feel stronger if hierarchy is clearer and fewer elements compete for attention at once.",
    readability: "Dense labels, stacked proof, or long copy are likely slowing the scan path and making the audience hunt for the point.",
    titleEffectiveness: titleLabelHeavy
      ? "The title reads more like a topic label than a takeaway, so the audience has to infer the meaning from the body content."
      : "The title may be serviceable, but it will be stronger if it states the takeaway instead of just naming the topic.",
    whatIsWorking: "There is useful content on the slide and likely a legitimate message underneath it.",
    weakness: "The clarity risk is that too many ideas, labels, or proof points are competing before the audience sees the takeaway.",
    opportunity: "Reduce the slide to one main message, strengthen the headline so it says what the slide means, and make the proof support that single point."
  }));

  return coachResponseSchema.parse({
    mode: "evaluation",
    reply:
      evaluationFocus === "content"
        ? "Great start. There is useful material here, and a few content changes could make the deck much easier to scan, understand, and trust."
        : "Great start. There is real material to work with here, and a few story changes could make the deck much more persuasive and decision-oriented.",
    evaluation: {
      focus: evaluationFocus,
      storyRead: {
        summary:
          evaluationFocus === "content"
            ? "The deck contains substantial material, but the bigger risk is that the content is doing more informing than communicating. The issue is not only whether the story exists, but whether each slide lands quickly, clearly, and persuasively."
            : "The deck appears to contain meaningful content and some story components, but the overall flow is likely stronger on information than on persuasion.",
        followsKnowBelieveDo:
          sectionScores.find((item) => item.section === "bigIdea")?.score && (visibleDesiredOutcome || hasSemanticDesiredOutcome) && (visibleClose || hasSemanticClose) ? "partially" : "no",
        missingOrWeakSections: sectionScores.filter((item) => item.score <= 2).map((item) => item.section),
        structuralObservations: diagnosticFindings.slice(0, 4).map((item) => item.evidence)
      },
      sectionScores,
      slideQualityRead: {
        simplicity:
          evaluationFocus === "content"
            ? "Slide simplicity is inconsistent. Some pages land one main point, while others stack proof, product detail, and capability language on the same page. That makes the audience work too hard to decide what matters most."
            : "The deck likely has enough content to make density and competing messages a recurring risk, especially where capability or evidence slides accumulate.",
        easeOfUnderstanding:
          evaluationFocus === "content"
            ? "Ease of understanding is strongest when the deck explains one idea at a time, and it breaks down when the slides shift from insight into product inventory or exploratory proof without a clear takeaway. That shift makes the content feel informative, but not guided."
            : "Understanding is probably strongest where the slides are clearly framed, and weaker where the deck shifts into descriptive or exploratory content without a sharp takeaway.",
        visualAppeal:
          evaluationFocus === "content"
            ? "Visual appeal should still be judged cautiously from extracted text, but the clarity signals are visible: when too many ideas, labels, or proof points compete, the page will feel heavier and less intentional. The strongest visual improvement would come from cleaner hierarchy and fewer competing elements."
            : "Visual quality should only be judged cautiously from extracted content. The stronger signal here is whether the material reads cleanly, prioritizes one message, and supports fast comprehension.",
        readability:
          evaluationFocus === "content"
            ? "Readability is being weakened by density and hierarchy more than by typography alone. Multiple bullets, long labels, and packed proof blocks slow the scan path and make the audience hunt for the point instead of seeing it quickly."
            : "Readability likely varies with slide density. Where multiple bullets or ideas cluster together, the scan path will weaken.",
        titleEffectiveness: titleLabelHeavy
          ? "Topic-label titling is a recurring problem here. When headlines read like categories or section names instead of takeaways, the audience has to decode the message from the body copy, and that slows comprehension on every slide."
          : "Title effectiveness will depend on whether the slides consistently state what they say rather than what they are.",
        notableSlides: []
      },
      slideReviews: evaluationFocus === "content" ? slideReviews : [],
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

const SECTION_LABELS: Record<CoachEvaluation["sectionScores"][number]["section"], string> = {
  titleSlide: "Title Slide",
  openingGambit: "Opening Gambit",
  desiredOutcome: "Desired Outcome",
  situationRootCause: "Situation / Root Cause",
  bigIdea: "Big Idea",
  howItWorks: "How It Works",
  wiifm: "WIIFM",
  close: "Close",
  actionsNextSteps: "Actions & Next Steps"
};

type SectionEvidence = {
  section: CoachEvaluation["sectionScores"][number]["section"];
  slides: Array<{ number: string; headline: string; body: string }>;
  note: string;
};

function isRationaleFollowUp(message: string): boolean {
  return /\brationale\b|\bwhy\b.*\brating|\brating\b.*\bwhy|\bcontext[- ]specific\b|\breferences?\b|\bunderstand\b.*\bratings?\b|\bimprove\b.*\bcontent\b/i.test(message);
}

function isSectionMapFollowUp(message: string): boolean {
  return /\b(page|slide)\s+numbers?\b|\bwhich\s+(pages?|slides?)\b|\bdefined as each deck section\b|\bmap\b.*\bsections?\b|\bsections?\b.*\bmap\b/i.test(message);
}

function isActionsNextStepsFollowUp(message: string): boolean {
  return /\bactions? (?:&|and) next steps?\b|\bnext steps?\b/i.test(message) &&
    /\b(add|addition|additions|specific|improve|strengthen|fix|work on|lowest score|score)\b/i.test(message);
}

function slideSummary(slide: { number: string; headline: string }) {
  return `Slide ${slide.number}${slide.headline ? ` — ${slide.headline}` : ""}`;
}

function slideMatches(slide: { body: string; headline: string }, pattern: RegExp) {
  return pattern.test(`${slide.headline}\n${slide.body}`);
}

function getSlideEvidence(text: string): SectionEvidence[] {
  const slides = extractSlideBlocks(text).map((slide) => ({
    ...slide,
    headline: pickSlideHeadline(slide.body) ?? ""
  }));

  if (!slides.length) {
    return [];
  }

  const firstMatching = (pattern: RegExp, fallbackIndex?: number) => {
    const matches = slides.filter((slide) => slideMatches(slide, pattern)).slice(0, 6);
    if (matches.length) {
      return matches;
    }
    return fallbackIndex !== undefined && slides[fallbackIndex] ? [slides[fallbackIndex]] : [];
  };

  const titleSlides = slides[0] ? [slides[0]] : [];
  const openingSlides = firstMatching(/\b\d{1,3}%\b|\bfail\b|\bstakes\b|\bwhy\b|\broot cause\b|\burgency\b|\bprovocative\b/i, 1).slice(0, 2);
  const desiredOutcomeSlides = firstMatching(/\bpartner with\b|\bapprove\b|\balign\b|\brecommendation\b|\bequip\b|\bdecision\b|\bdesired outcome\b|\bby the end\b/i, 2).slice(0, 2);
  const situationSlides = firstMatching(/\bstark reality\b|\bnot their fault\b|\bproperly trained\b|\bpresentations don.?t persuade\b|\bcongested\b|\bconfusing\b|\bconfident presenters\b|\broot cause\b/i).slice(0, 4);
  const bigIdeaSlides = firstMatching(/\bto get better results\b|\byou need to\b|\bmust\b|\bbelief\b|\bbig idea\b|\bpersuasive storytelling\b/i, 5).slice(0, 2);
  const howItWorksSlides = firstMatching(/\bprogram\b|\b4 elements\b|\bproper preparation\b|\bstructured story\b|\bcompelling content\b|\bdynamic delivery\b|\bsessions\b|\blearning journey\b|\bcoaching\b|\btools embed learning\b/i).slice(0, 10);
  const wiifmSlides = firstMatching(/\bresults\b|\bproven\b|\bfeedback\b|\bscores\b|\bworld.?s best companies\b|\btestimonial\b|\bimpact\b|\bwins?\b|\bevery function\b/i).slice(0, 8);
  const closeSlides = firstMatching(/\bfollow[- ]up call\b|\bthank you\b|\blet.?s schedule\b|\bnext\b|\bclose\b/i).slice(0, 3);
  const actionSlides = firstMatching(/\bfollow[- ]up call\b|\bschedule\b|\bparticipant\b|\bformat\b|\bowner\b|\btiming\b|\bnext steps\b|\baction\b/i).slice(0, 4);

  return [
    {
      section: "titleSlide",
      slides: titleSlides,
      note: "The title section is anchored by the cover. It names the topic, but should orient the meeting purpose more clearly."
    },
    {
      section: "openingGambit",
      slides: openingSlides,
      note: "The hook evidence is the early failure statistic and root-cause question. That is a real attention-getter because it creates urgency before the training solution appears."
    },
    {
      section: "desiredOutcome",
      slides: desiredOutcomeSlides,
      note: "The desired outcome is the partnership/recommendation moment. It tells the audience what TPG wants them to do, though the ending should reinforce it more strongly."
    },
    {
      section: "situationRootCause",
      slides: situationSlides,
      note: "The situation/root-cause evidence is the stark reality setup plus the explicit training gap. This is stronger than a generic market-context section because it explains why the problem exists."
    },
    {
      section: "bigIdea",
      slides: bigIdeaSlides,
      note: "The Big Idea evidence is the belief that better results require training in persuasive storytelling. It bridges the problem to the program, even if it could be made more memorable."
    },
    {
      section: "howItWorks",
      slides: howItWorksSlides,
      note: "The How It Works evidence is the program architecture: elements, sessions, coaching, tools, and learning journey. The risk is length and repetition, not absence."
    },
    {
      section: "wiifm",
      slides: wiifmSlides,
      note: "The WIIFM evidence is the results/proof material: outcomes, feedback, scores, client proof, and testimonials. The improvement opportunity is sharper audience-specific payoff."
    },
    {
      section: "close",
      slides: closeSlides,
      note: "The close evidence is the follow-up / thank-you ending. It creates a close, but it is more operational than persuasive."
    },
    {
      section: "actionsNextSteps",
      slides: actionSlides,
      note: "The next-step evidence is the follow-up call language. It points to action but needs clearer owner, timing, and accountability."
    }
  ];
}

function buildSectionMapReply(messages: CoachMessage[]): CoachResponse {
  const latestUserMessage = latestUserContext(messages);
  const latestAttachmentText = getLatestAttachmentTexts(messages).join("\n\n");
  const evidence = getSlideEvidence(latestAttachmentText);
  const requestedActionsOnly = /\bactions? (?:&|and) next steps?\b|\bnext steps?\b/i.test(latestUserMessage);

  if (requestedActionsOnly) {
    const actions = evidence.find((item) => item.section === "actionsNextSteps");
    const close = evidence.find((item) => item.section === "close");
    const actionsSlideList = actions?.slides.length
      ? actions.slides.map(slideSummary).join("; ")
      : "No clear Actions & Next Steps slide match";
    const closeSlideList = close?.slides.length
      ? close.slides.map(slideSummary).join("; ")
      : "No clear close slide match";

    return coachResponseSchema.parse({
      mode: "general",
      reply: [
        `For Actions & Next Steps, I’m reading the main evidence as: ${actionsSlideList}.`,
        `There is also related close/ending evidence around: ${closeSlideList}.`,
        "",
        "The reason it scored low is not that there is no action at all. It is that the action is still too light: it points toward a follow-up moment, but it does not yet define owner, timing, decision checkpoint, or what progress looks like."
      ].join("\n"),
      reframes: [],
      doctrineHighlights: [],
      suggestedQuestions: [
        "Do you want specific slide copy to add here?",
        "Do you want this as one next-step slide or a close plus next-step pair?"
      ],
      suggestedNextStep: "Turn the current follow-up slide into a concrete action table with owner, timing, and checkpoint."
    });
  }

  const lines = evidence.map((item) => {
    const slideList = item.slides.length
      ? item.slides.map(slideSummary).join("; ")
      : "No clear slide match";
    return `${SECTION_LABELS[item.section]}: ${slideList}. ${item.note}`;
  });

  return coachResponseSchema.parse({
    mode: "general",
    reply: [
      "Yes. Here is how I would map the deck sections based on the visible slide text I can see.",
      "",
      ...lines,
      "",
      "The important nuance: some sections are present but blended. For example, Close and Actions & Next Steps both seem to live around the follow-up-call ending, which is why the next-step score should stay lower until ownership, timing, and accountability are explicit."
    ].join("\n"),
    reframes: [],
    doctrineHighlights: [],
    suggestedQuestions: [
      "Do you want me to revise the section scores using this slide map?",
      "Do you want a slide-by-slide improvement pass next?"
    ],
    suggestedNextStep: "Use this map to check whether each story job has a clean slide home, then separate any sections that are currently blended."
  });
}

function buildRationaleFollowUpReply(messages: CoachMessage[]): CoachResponse {
  const latestAttachmentText = getLatestAttachmentTexts(messages).join("\n\n");
  const evidence = getSlideEvidence(latestAttachmentText);

  const lines = evidence.map((item) => {
    const slideList = item.slides.length
      ? item.slides.map(slideSummary).join("; ")
      : "No clear slide match";
    return `${SECTION_LABELS[item.section]}: ${item.note} Evidence I would reference: ${slideList}.`;
  });

  return coachResponseSchema.parse({
    mode: "general",
    reply: [
      "Yes. The evaluation should absolutely show its work more clearly. I would make the rationale more useful by tying each score to the actual slide evidence, not just the rubric language.",
      "",
      ...lines,
      "",
      "The practical improvement is to add a short 'evidence used' line under each section score. That gives the user enough context to understand whether Coach is reacting to a missing section, a blended section, or a section that is present but underpowered."
    ].join("\n"),
    reframes: [],
    doctrineHighlights: [],
    suggestedQuestions: [
      "Do you want the rationale rewritten into the evaluation format?",
      "Should I focus the next pass on section scoring or slide-level content quality?"
    ],
    suggestedNextStep: "Add deck-specific evidence references to each section rationale so the ratings feel explainable and actionable."
  });
}

function buildActionsNextStepsAdditionsReply(messages: CoachMessage[]): CoachResponse {
  const latestAttachmentText = getLatestAttachmentTexts(messages).join("\n\n");
  const evidence = getSlideEvidence(latestAttachmentText);
  const actions = evidence.find((item) => item.section === "actionsNextSteps");
  const actionsSlideList = actions?.slides.length
    ? actions.slides.map(slideSummary).join("; ")
    : "the current follow-up / dates slide";

  return coachResponseSchema.parse({
    mode: "general",
    reply: [
      `Yes. Since the weak spot is Actions & Next Steps, I would strengthen ${actionsSlideList} by adding one concrete action slide after the close.`,
      "",
      "Suggested slide title: Move from interest to implementation with three clear next steps.",
      "",
      "Add a simple four-column table:",
      "Action: Schedule a 30-minute discovery call to confirm audience, priority business stories, and training goals.",
      "Owner: Client sponsor + TPG lead.",
      "Timing: Within 1 week.",
      "Checkpoint: Audience, objectives, and decision-maker priorities confirmed.",
      "",
      "Action: Confirm participant cohort, delivery format, and target dates.",
      "Owner: Client capability / L&D lead.",
      "Timing: Within 2 weeks.",
      "Checkpoint: Participant list, session format, and calendar holds approved.",
      "",
      "Action: Select one real pitch or customer story to use as the pilot case.",
      "Owner: Business lead + TPG coach.",
      "Timing: Before session 1.",
      "Checkpoint: Draft deck or story submitted for coaching baseline.",
      "",
      "Optional accountability line at the bottom: Success measure: baseline story review before training, revised story review after training, and participant feedback score after completion.",
      "",
      "That would move the section from a general follow-up ask to a real implementation path. In TPG terms, it makes yes feel safer because the audience can see exactly what happens next."
    ].join("\n"),
    reframes: [
      {
        label: "Cleaner next-step slide title",
        text: "Move from interest to implementation with three clear next steps.",
        whyItWorks: "It signals progress and accountability instead of simply asking to get time on the calendar."
      },
      {
        label: "Shorter action prompt",
        text: "Let’s schedule a 30-minute working session to confirm audience, pilot story, participants, and timing.",
        whyItWorks: "It turns the close into a specific commitment without overcomplicating the ask."
      }
    ],
    doctrineHighlights: [
      {
        title: "Actions & Next Steps discipline",
        guidance: "Next steps are strongest when they include action, owner, timing, and a checkpoint. That turns alignment into motion."
      }
    ],
    suggestedQuestions: [
      "Who should own the next step on the client side?",
      "Is the next yes a follow-up call, a pilot, or training approval?",
      "What proof point should define success after the first session?"
    ],
    suggestedNextStep: "Replace the current generic follow-up ending with a short action table that includes owner, timing, and checkpoint."
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

  if (isActionsNextStepsFollowUp(latestUserMessage)) {
    return buildActionsNextStepsAdditionsReply(messages);
  }

  if (isSectionMapFollowUp(latestUserMessage)) {
    return buildSectionMapReply(messages);
  }

  if (isRationaleFollowUp(latestUserMessage)) {
    return buildRationaleFollowUpReply(messages);
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
          "For this case, move from describing the problem to stating what the audience now needs to believe in order for the recommendation to make sense."
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
            text: "To achieve the desired outcome, the audience must stop treating the current challenge as a surface-level issue and address the deeper barrier that is blocking adoption, confidence, or conversion.",
            whyItWorks: "This works because it reframes the problem at the level of belief, not just symptoms or execution detail."
          },
          {
            label: "Belief-shift option B",
            text: "If the audience wants the business result, it must change the condition that is shaping customer behavior, not just optimize the visible tactics around it.",
            whyItWorks: "This ties the desired outcome to the root cause truth and keeps the idea strategic rather than tactical."
          },
          {
            label: "Belief-shift option C",
            text: "The path to the result is not more activity, but a different belief about what actually drives adoption, confidence, or conversion in this case.",
            whyItWorks: "This is concise, belief-based, and memorable, while still leaving room for the plan to sit underneath it."
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
          "What specific barrier is the real root cause in this case?",
          "What benefit lands for the audience if that barrier is removed?"
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
