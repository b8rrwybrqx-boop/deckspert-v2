import { callLLM } from "../../core/llm/client.js";
import {
  creatorGenerateResponseSchema,
  type ExtractedInputs,
  type SectionMapProposal,
  type StorySection,
  type StoryboardSlide
} from "../../core/schemas/story.js";
import { STORY_SECTION_ORDER, STORY_SECTION_LABELS } from "../../core/story/structure.js";
import { buildCreatorGeneratePrompt } from "./prompts.js";

type ArtifactReference = {
  artifactId?: string;
  label: string;
  kind: "image" | "pdf" | "pptx" | "doc" | "text" | "video";
  sourceType?: "extractedText" | "visionSummary";
  notes?: string;
};

type CreatorGenerateInput = {
  extractedInputs: ExtractedInputs;
  sectionMapProposal: SectionMapProposal;
  tone?: string;
  artifactsUsed?: ArtifactReference[];
};

const topicLabelPattern =
  /^(title|opening gambit|desired outcome|situation|root cause|big idea|how it works|wiifm|close|actions?(?: &| and)? next steps?|agenda|overview|summary)$/i;
const worksheetNoisePattern =
  /©\d{4}|proper preparation|planning worksheet|behavioral style|type of need|addressed by desired outcome|reasons to say yes|reasons to say no|core\(dept\/category\) needs/i;
const genericCreatorPattern =
  /today’s situation creates pressure|underlying barrier has not yet been translated|confirm the decision|align on the recommendation|define the next step and owner|strategy works through/i;
const metaVoicePattern =
  /^(the audience should|this should feel|frame the story|show how|ground it in)\b/i;
const solutionDescriptionPattern =
  /\b(solution|platform|tool|capabilit(?:y|ies)|portfolio|workstream|pilot|roadmap|implementation|execute|launch|deploy|roll out|technical resources)\b/i;
const actionVerbPattern = /\b(approve|align|endorse|commit|fund|adopt|pilot|launch|implement|pursue|understand)\b/i;
const benefitVerbPattern = /\b(grow|increase|reduce|improve|protect|strengthen|accelerate|regain|unlock|differentiate|de-risk|avoid|enable)\b/i;
const incompleteEndingPattern =
  /\b(to|for|with|and|or|but|because|so|as|by|of|in|on|at|from|into|than|while|through|around|across|before|after|the|a|an|its|their|our|your|attract|regain|rebuild|increase|reduce|improve|unlock|deliver|create|drive)$/i;

function sentenceCase(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function trimSentence(input: string, maxLength = 110) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized.replace(/[.;:,]+$/, "");
  }

  const sentenceEndIndex = Math.max(
    normalized.lastIndexOf(".", maxLength),
    normalized.lastIndexOf("?", maxLength),
    normalized.lastIndexOf("!", maxLength)
  );
  if (sentenceEndIndex > Math.floor(maxLength * 0.55)) {
    return normalized.slice(0, sentenceEndIndex + 1).replace(/[.;:,]+$/, "");
  }

  const clauseEndIndex = Math.max(
    normalized.lastIndexOf(";", maxLength),
    normalized.lastIndexOf(":", maxLength),
    normalized.lastIndexOf(",", maxLength)
  );
  const raw = clauseEndIndex > Math.floor(maxLength * 0.55)
    ? normalized.slice(0, clauseEndIndex)
    : normalized.slice(0, maxLength).replace(/\s+\S*$/, "");

  return removeIncompleteEnding(raw);
}

function removeIncompleteEnding(input: string) {
  let output = input.replace(/[.;:,]+$/, "").trim();
  while (incompleteEndingPattern.test(output)) {
    output = output.replace(/\s+\S+$/, "").trim();
  }
  return output;
}

function isIncompleteSyntax(input: string | null | undefined) {
  if (!input) {
    return true;
  }
  const normalized = input.replace(/\s+/g, " ").trim();
  return !normalized || incompleteEndingPattern.test(normalized) || /[,;:]\s*$/.test(normalized);
}

function ensureCompleteText(input: string, fallback: string, maxLength = 140) {
  const trimmed = trimSentence(input, maxLength);
  if (isIncompleteSyntax(trimmed)) {
    return trimSentence(fallback, maxLength);
  }
  return trimmed;
}

function looksLikeWorksheetBlob(input: string | null | undefined) {
  if (!input) {
    return false;
  }

  const normalized = input.replace(/\s+/g, " ").trim();
  const pipeCount = (normalized.match(/\|/g) ?? []).length;
  const noiseHits = [
    /©\d{4}/i,
    /proper preparation/i,
    /planning worksheet/i,
    /behavioral style/i,
    /reasons to say yes/i,
    /reasons to say no/i
  ].filter((pattern) => pattern.test(normalized)).length;

  return normalized.length > 220 && (pipeCount >= 5 || noiseHits >= 2);
}

function cleanNarrativeText(input: string | null | undefined, maxLength = 140): string | null {
  if (!input) {
    return null;
  }

  const normalized = input.replace(/\s+/g, " ").replace(/\s+\|\s+/g, " ").trim();
  if (!normalized || looksLikeWorksheetBlob(normalized) || worksheetNoisePattern.test(normalized)) {
    return null;
  }

  return trimSentence(normalized, maxLength);
}

function cleanStrategicText(input: string | null | undefined, maxLength = 140): string | null {
  const cleaned = cleanNarrativeText(input, maxLength);
  if (!cleaned || genericCreatorPattern.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function cleanList(items: string[], maxItems = 5, maxLength = 90) {
  return Array.from(
    new Set(
      items
        .map((item) => cleanNarrativeText(item, maxLength))
        .filter((item): item is string => Boolean(item))
    )
  ).slice(0, maxItems);
}

function lowerFirst(input: string) {
  if (!input) {
    return input;
  }
  return input[0].toLowerCase() + input.slice(1);
}

function titleCase(input: string) {
  const minorWords = new Set(["a", "an", "and", "as", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return input
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function rewriteNeedAsClause(input: string) {
  const trimmed = input.trim().replace(/\.$/, "");
  if (!trimmed) {
    return trimmed;
  }

  return trimmed
    .replace(/^Meet expectations for /i, "meeting expectations for ")
    .replace(/^Offer additional /i, "offering additional ")
    .replace(/^Reliable partner who will fulfill /i, "a reliable partner who fulfills ")
    .replace(/^Affordable /i, "affordable ")
    .replace(/^Blend approach adds /i, "a blend approach that adds ")
    .replace(/^Being part of /i, "being part of ")
    .replace(/^Regaining /i, "regaining ")
    .replace(/^Re-establish /i, "re-establishing ");
}

function rewriteNeedAsOutcome(input: string) {
  const clause = rewriteNeedAsClause(input);
  if (!clause) {
    return clause;
  }

  return clause
    .replace(/^meeting /i, "meet ")
    .replace(/^offering /i, "offer ")
    .replace(/^being /i, "be ")
    .replace(/^re-establishing /i, "re-establish ")
    .replace(/^regaining /i, "regain ");
}

function normalizeDecisionTarget(input: string) {
  return input
    .trim()
    .replace(/^gain approval to /i, "")
    .replace(/^secure approval to /i, "")
    .replace(/^gain alignment to /i, "")
    .replace(/^secure alignment to /i, "")
    .replace(/^agree to /i, "")
    .replace(/^approve /i, "")
    .replace(/^align to /i, "")
    .replace(/^endorse /i, "")
    .replace(/^commit to /i, "")
    .replace(/^pursue /i, "")
    .trim();
}

function buildDesiredOutcomeStatement(
  desiredOutcome: string | null,
  reasonsYes: string[],
  needs: { core: string[]; business: string[]; personal: string[] }
) {
  const target = desiredOutcome ? normalizeDecisionTarget(desiredOutcome) : "";
  const businessPurpose =
    reasonsYes.find((item) => /growth|share|prospect|trust|margin|revenue|business|customer|market/i.test(item)) ??
    needs.business[0] ??
    needs.core[0] ??
    "move the business forward with a clearer path to impact";

  if (!target) {
    return "Align on the recommended direction so the team can move forward with a clear business purpose.";
  }

  const verb = /understand|awareness|learn|see why|recognize/i.test(target)
    ? "Understand"
    : /align|endorse|commit|fund|approve|adopt|pilot|launch|implement|pursue/i.test(desiredOutcome ?? "")
      ? sentenceCase((desiredOutcome ?? "").trim().split(/\s+/)[0] ?? "Approve")
      : "Approve";

  const purpose = ensureCompleteText(
    rewriteNeedAsOutcome(businessPurpose),
    "move the business forward with a clearer path to impact",
    90
  );
  return ensureCompleteText(`${verb} ${lowerFirst(target)} so we can ${lowerFirst(purpose)}.`, `${verb} ${lowerFirst(target)}.`, 150);
}

function compactMeetingObject(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const normalized = normalizeDecisionTarget(input)
    .replace(/\bso we can\b.*$/i, "")
    .replace(/\bto regain\b.*$/i, "")
    .replace(/\bto grow\b.*$/i, "")
    .replace(/\bto unlock\b.*$/i, "")
    .replace(/\busing\b/i, "with")
    .replace(/\bnew projects?\s+(with|using)\b/i, "")
    .replace(/\bpursue\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? titleCase(ensureCompleteText(normalized, "the Recommended Growth Plan", 74)) : null;
}

function buildMeetingTitle(
  desiredOutcome: string | null,
  bigIdea: string | null,
  reasonsYes: string[],
  needs: { core: string[]; business: string[]; personal: string[] }
) {
  const object = compactMeetingObject(desiredOutcome);
  const growthSignal = reasonsYes.find((item) => /growth|share|prospect|regain|win|market|trust/i.test(item));
  const audienceValue = needs.personal.find((item) => /brand|differentiat|innovation/i.test(item)) ?? needs.business[0];

  if (object && growthSignal) {
    return ensureCompleteText(`Regaining Growth With ${object}`, object, 82);
  }

  if (object) {
    return ensureCompleteText(object, "Strategic Alignment Discussion", 82);
  }

  if (audienceValue) {
    return ensureCompleteText(titleCase(rewriteNeedAsOutcome(audienceValue)), "Strategic Alignment Discussion", 82);
  }

  return ensureCompleteText(bigIdea ?? "Strategic Alignment Discussion", "Strategic Alignment Discussion", 82);
}

function summarizeNeed(input: string, maxLength = 58) {
  const normalized = rewriteNeedAsClause(input)
    .replace(/meeting expectations for eating enjoyment by offering solutions for improved taste and texture/i, "strong taste, texture, and consumer appeal")
    .replace(/eating enjoyment by offering solutions for improved taste and texture/i, "strong taste, texture, and consumer appeal")
    .replace(/eating enjoyment by offering/i, "strong eating enjoyment through")
    .replace(/eating enjoyment improved taste/i, "strong taste and eating enjoyment")
    .replace(/which don’t raise formulation costs while /i, "with cost discipline and ")
    .replace(/meeting expectations for /i, "")
    .replace(/by offering solutions for /i, "")
    .replace(/a reliable partner who fulfills /i, "reliable execution of ")
    .replace(/offering additional innovation and value to help /i, "")
    .replace(/offering additional innovation and value/i, "additional innovation and value")
    .replace(/increase brand appeal and differentiate from competition/i, "stronger brand appeal and differentiation")
    .replace(/additional innovation and value stronger brand appeal and differentiation/i, "additional innovation, brand appeal, and differentiation")
    .trim();

  return trimSentence(normalized, maxLength);
}

function stripTerminalPeriod(input: string) {
  return input.replace(/[.]+$/, "").trim();
}

function joinWithAnd(items: string[]) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function inferOpeningGambitTakeaway(
  situation: string | null,
  rootCause: string | null,
  reasonsYes: string[],
  objections: string[],
  proofPoints: string[]
) {
  const marketPressure = objections.find((item) => /commoditized|crowded market|price/i.test(item));
  const costPressure = objections.find((item) => /affordable|cost/i.test(item));
  const trustRisk = objections.find((item) => /poor previous experiences|trust/i.test(item));
  const growthSignal = reasonsYes.find((item) => /regaining shares|new prospects|re-establish trust/i.test(item));
  const platformAdvantage = reasonsYes.find((item) => /technical resources|larger ingredion|consumer drivers/i.test(item));
  const quotedProof = proofPoints.find((item) => /%|\$|\b\d+\b|market|share|growth|loss/i.test(item));

  if (quotedProof) {
    return trimSentence(`"${stripTerminalPeriod(quotedProof)}" changes the stakes of this decision.`, 100);
  }

  if (marketPressure && growthSignal) {
    return trimSentence(
      `${stripTerminalPeriod(marketPressure)} is turning growth into a commodity game we are unlikely to win.`,
      100
    );
  }

  if (costPressure && platformAdvantage) {
    return trimSentence(
      `If the choice is framed as price alone, ${lowerFirst(stripTerminalPeriod(platformAdvantage))} never gets valued.`,
      105
    );
  }

  if (trustRisk) {
    return trimSentence(
      `${stripTerminalPeriod(trustRisk)} will keep stalling growth until the story changes.`,
      95
    );
  }

  if (situation && rootCause) {
    return trimSentence(
      `${stripTerminalPeriod(situation)}. But the real risk is ${lowerFirst(stripTerminalPeriod(rootCause))}.`,
      110
    );
  }

  return null;
}

function buildOpeningHook(
  providedOpening: string | null,
  inferredOpening: string | null,
  rootCause: string | null,
  reasonsYes: string[],
  objections: string[],
  proofPoints: string[]
) {
  if (providedOpening && !genericCreatorPattern.test(providedOpening)) {
    return ensureCompleteText(providedOpening, providedOpening, 105);
  }

  const proof = proofPoints.find((item) => /%|\$|\b\d+\b|share|growth|loss|consumer|market/i.test(item));
  if (proof) {
    return ensureCompleteText(`"${stripTerminalPeriod(proof)}" is the signal we should not ignore.`, inferredOpening ?? proof, 105);
  }

  const commoditized = objections.find((item) => /commoditized|crowded|commodity|price/i.test(item));
  const growth = reasonsYes.find((item) => /regain|growth|share|prospect|win/i.test(item));
  if (commoditized && growth) {
    return ensureCompleteText(
      `If this stays a commodity conversation, the growth opportunity stays out of reach.`,
      inferredOpening ?? commoditized,
      105
    );
  }

  const trustDamage = objections.find((item) => /poor previous|trust|credibil|relationship|failure/i.test(item));
  if (trustDamage) {
    return ensureCompleteText(
      `The hardest thing to rebuild here is not the formula; it is trust.`,
      inferredOpening ?? trustDamage,
      105
    );
  }

  const costPressure = objections.find((item) => /cost|affordable|price/i.test(item));
  if (costPressure && rootCause) {
    return ensureCompleteText(
      `Price is the visible pressure, but confidence is the real decision barrier.`,
      inferredOpening ?? rootCause,
      105
    );
  }

  return ensureCompleteText(inferredOpening ?? "The story needs one sharper fact or tension before the audience will lean in.", "The story needs one sharper fact or tension before the audience will lean in.", 105);
}

function inferSituationTakeaway(
  needs: { core: string[]; business: string[]; personal: string[] },
  objections: string[],
  reasonsYes: string[]
) {
  const marketPressure = objections.find((item) => /commoditized/i.test(item));
  const trustPressure = objections.find((item) => /poor previous experiences|trust/i.test(item));
  const affordabilityNeed = needs.core.find((item) => /affordable|formulation costs|cost/i.test(item));
  const performanceNeed = needs.core.find((item) => /taste|texture|consumer appeal|eating enjoyment/i.test(item));
  const growthSignal = reasonsYes.find((item) => /regaining shares|new prospects|re-establish trust/i.test(item));

  if (affordabilityNeed && performanceNeed && marketPressure) {
    return trimSentence(
      `The audience needs ${rewriteNeedAsClause(affordabilityNeed)} while also ${rewriteNeedAsClause(
        performanceNeed
      )}, but ${lowerFirst(marketPressure)} is making the decision feel like a commodity tradeoff.`,
      140
    );
  }

  if (growthSignal && trustPressure) {
    return trimSentence(
      `${growthSignal} now depends on overcoming ${lowerFirst(trustPressure)} and reframing the choice around broader business value.`,
      140
    );
  }

  return null;
}

function inferRootCauseTakeaway(
  needs: { core: string[]; business: string[]; personal: string[] },
  objections: string[],
  reasonsYes: string[]
) {
  const marketPressure = objections.find((item) => /commoditized|affordable solution|price/i.test(item));
  const riskPressure = objections.find((item) => /reformulation|human resources|poor previous experiences|risk/i.test(item));
  const trustDamage = objections.find((item) => /poor previous experiences|trust|credibil|supplier failure|relationship/i.test(item));
  const partnerNeed = needs.business.find((item) => /reliable partner|fulfill/i.test(item));
  const differentiationNeed = needs.personal.find((item) => /differentiate|brand appeal|innovation/i.test(item));
  const platformReason = reasonsYes.find((item) => /larger ingredion|technical resources|broader access/i.test(item));

  if (trustDamage) {
    return trimSentence(
      `The real barrier is not only product fit; ${lowerFirst(stripTerminalPeriod(trustDamage))} has made the audience need proof that execution will be different this time.`,
      150
    );
  }

  if (marketPressure && platformReason) {
    return trimSentence(
      `The decision is still being evaluated like a commodity choice instead of a broader value story, so ${lowerFirst(
        platformReason
      )} is not yet changing the buying criteria.`,
      140
    );
  }

  if (riskPressure && partnerNeed) {
    return trimSentence(
      `The audience does not yet see a low-risk path from the recommendation to execution, even though they need ${lowerFirst(
        partnerNeed
      )}.`,
      140
    );
  }

  if (differentiationNeed) {
    return trimSentence(
      `The story has not yet connected the recommendation to how the audience can ${lowerFirst(
        rewriteNeedAsOutcome(differentiationNeed)
      )} without raising delivery risk.`,
      140
    );
  }

  return null;
}

function inferBigIdeaTakeaway(
  needs: { core: string[]; business: string[]; personal: string[] },
  objections: string[],
  reasonsYes: string[]
) {
  const affordabilityNeed = needs.core.find((item) => /affordable|formulation costs|cost/i.test(item));
  const performanceNeed = needs.core.find((item) => /taste|texture|consumer appeal|eating enjoyment/i.test(item));
  const partnerNeed = needs.business.find((item) => /reliable partner|fulfill/i.test(item));
  const technicalAdvantage = reasonsYes.find((item) => /technical resources|larger ingredion|consumer drivers/i.test(item));
  const trustRisk = objections.find((item) => /poor previous experiences|reformulation|human resources/i.test(item));

  if (affordabilityNeed && performanceNeed && technicalAdvantage) {
    return trimSentence(
      `To win, the audience must stop treating cost discipline and consumer appeal as a tradeoff.`,
      140
    );
  }

  if (partnerNeed && trustRisk) {
    return trimSentence(
      `To rebuild confidence, the audience needs a lower-risk path that proves reliability before asking for broader commitment.`,
      140
    );
  }

  return null;
}

function buildBeliefStatement(
  extractedBigIdea: string | null,
  needs: { core: string[]; business: string[]; personal: string[] },
  objections: string[],
  reasonsYes: string[]
) {
  const inferred = inferBigIdeaTakeaway(needs, objections, reasonsYes);
  const cleaned = cleanStrategicText(extractedBigIdea, 135);
  const candidate = inferred ?? cleaned;

  if (candidate && !solutionDescriptionPattern.test(candidate) && !/[,;]\s*(then|and then|by|through)\b/i.test(candidate)) {
    return rewriteMetaVoice(candidate);
  }

  const businessOutcome =
    reasonsYes.find((item) => /growth|share|prospect|trust|differentiat|brand|market/i.test(item)) ??
    needs.personal[0] ??
    needs.business[0] ??
    "create value";
  const barrier =
    objections.find((item) => /commoditized|cost|price|reformulation|trust|risk|resource/i.test(item)) ??
    "the current barrier";

  return trimSentence(
    `To ${lowerFirst(rewriteNeedAsOutcome(businessOutcome))}, the audience must reframe ${lowerFirst(
      stripTerminalPeriod(barrier)
    )} as a solvable growth constraint.`,
    135
  );
}

function inferWiifmTakeaway(
  needs: { core: string[]; business: string[]; personal: string[] },
  reasonsYes: string[],
  objections: string[]
) {
  const benefitSignals = [
    reasonsYes.find((item) => /regaining shares|new prospects/i.test(item)),
    needs.business[0],
    needs.personal[0],
    reasonsYes.find((item) => /re-establish trust/i.test(item))
  ].filter((item): item is string => Boolean(item));
  const riskSignal = objections.find((item) => /reformulation|human resources|poor previous experiences/i.test(item));

  if (benefitSignals.length > 0) {
    const value = joinWithAnd(
      benefitSignals.slice(0, 3).map((item) =>
        lowerFirst(
          /brand appeal|differentiat/i.test(item)
            ? "stronger brand appeal and differentiation"
            : /reliable partner|fulfill/i.test(item)
              ? "more reliable execution"
              : trimSentence(item, 60)
        )
      )
    );
    return trimSentence(
      `Saying yes creates a lower-risk path to ${value}${riskSignal ? ` while reducing ${lowerFirst(riskSignal)}` : ""}.`,
      140
    );
  }

  return null;
}

function rankAudienceBenefits(
  needs: { core: string[]; business: string[]; personal: string[] },
  reasonsYes: string[],
  objections: string[]
) {
  const rawBenefits = [
    ...reasonsYes.filter((item) => /growth|share|prospect|trust|margin|revenue|customer|market|brand|differentiat/i.test(item)),
    ...needs.business,
    ...needs.personal,
    ...needs.core.filter((item) => /cost|taste|texture|consumer|appeal|speed|risk/i.test(item))
  ];
  const riskSignal = objections.find((item) => /reformulation|human resources|poor previous experiences|risk|cost/i.test(item));

  return Array.from(new Set(rawBenefits))
    .map((benefit) => {
      const normalized =
        /brand appeal|differentiat/i.test(benefit)
          ? "Strengthen brand appeal and differentiation in a crowded market"
          : /reliable partner|fulfill/i.test(benefit)
            ? "Gain a more reliable path from recommendation to execution"
            : /regain|share|prospect|growth/i.test(benefit)
              ? trimSentence(`Create a clearer path to ${lowerFirst(benefit)}`, 92)
              : /taste|texture|consumer appeal|eating enjoyment/i.test(benefit)
                ? "Improve consumer appeal without making formulation harder to defend"
                : trimSentence(sentenceCase(rewriteNeedAsOutcome(benefit)), 92);

      return normalized;
    })
    .concat(riskSignal ? [`Reduce adoption risk by addressing ${lowerFirst(trimSentence(riskSignal, 72))}`] : [])
    .filter((item) => benefitVerbPattern.test(item) || /gain|create/i.test(item))
    .slice(0, 3);
}

function inferHowItWorksPillars(
  needs: { core: string[]; business: string[]; personal: string[] },
  reasonsYes: string[],
  objections: string[]
) {
  const affordabilityNeed = needs.core.find((item) => /affordable|formulation costs|cost/i.test(item));
  const performanceNeed = needs.core.find((item) => /taste|texture|consumer appeal|eating enjoyment/i.test(item));
  const technicalAdvantage = reasonsYes.find((item) => /technical resources|larger ingredion|consumer drivers/i.test(item));
  const trustSignal = reasonsYes.find((item) => /re-establish trust|reliable partner/i.test(item)) ?? needs.business[0];
  const riskSignal = objections.find((item) => /reformulation|human resources|poor previous experiences/i.test(item));

  return [
    affordabilityNeed && performanceNeed
      ? `Cost-disciplined sensory performance: preserve affordability while improving ${summarizeNeed(performanceNeed, 72)}.`
      : null,
    technicalAdvantage
      ? `Integrated formulation support: connect tailored blends with Ingredion expertise and adjacent capabilities.`
      : null,
    trustSignal
      ? `Adoption confidence: create a clear path to ${lowerFirst(trimSentence(trustSignal, 65))}.`
      : riskSignal
        ? `Risk control: address ${lowerFirst(trimSentence(riskSignal, 65))}.`
        : null
  ].filter((item): item is string => Boolean(item));
}

function inferNextActions(
  needs: { core: string[]; business: string[]; personal: string[] },
  objections: string[]
) {
  const riskSignal = objections.find((item) => /reformulation|human resources|poor previous experiences/i.test(item));
  const performanceNeed = needs.core.find((item) => /taste|texture|consumer appeal|eating enjoyment/i.test(item));

  return [
    "Align on the account-specific value story and success criteria.",
    performanceNeed ? `Prioritize one pilot use case tied to ${summarizeNeed(trimSentence(performanceNeed, 65), 65)}.` : null,
    riskSignal ? "Prepare a risk-mitigation plan for reformulation and adoption concerns." : "Define the next step, owner, and timeline."
  ].filter((item): item is string => Boolean(item));
}

function formatNextStepBullet(action: string, index: number) {
  const cleanAction = trimSentence(action.replace(/^(action|next step)\s*[:\-]\s*/i, ""), 72);
  const owner = /technical|formulation|pilot|taste|texture/i.test(cleanAction)
    ? "Technical lead"
    : /communication|account|customer|trust/i.test(cleanAction)
      ? "Account lead"
      : index === 0
        ? "Commercial lead"
        : "Project lead";
  const timing = /pilot|formulation|test/i.test(cleanAction)
    ? "within 2-3 weeks"
    : index === 0
      ? "this meeting"
      : "before the next check-in";
  const checkpoint = /criteria|success/i.test(cleanAction)
    ? "success criteria agreed"
    : /risk|reformulation|adoption/i.test(cleanAction)
      ? "risk plan reviewed"
      : "owner confirms progress and decision needs";

  return `${sentenceCase(stripTerminalPeriod(cleanAction))} - Owner: ${owner}; Timing: ${timing}; Checkpoint: ${checkpoint}.`;
}

function buildActionSlideBullets(actions: string[], slideIndex: number, totalActionSlides: number) {
  const phaseDefinitions = [
    {
      name: "Decision alignment",
      fallback: "Confirm the decision, success criteria, and account-specific value story"
    },
    {
      name: "Pilot activation",
      fallback: "Select the first pilot use case and define the formulation support plan"
    },
    {
      name: "Commercial follow-through",
      fallback: "Set the account communication plan and review cadence"
    }
  ];
  const phase = phaseDefinitions[Math.min(slideIndex, phaseDefinitions.length - 1)];
  const sliceSize = Math.max(1, Math.ceil(actions.length / Math.max(totalActionSlides, 1)));
  const actionSlice = actions.slice(slideIndex * sliceSize, slideIndex * sliceSize + sliceSize);
  const sourceActions = actionSlice.length > 0 ? actionSlice : [phase.fallback];

  return [
    `Purpose: ${phase.name}.`,
    ...sourceActions.map((action, actionIndex) => formatNextStepBullet(action, slideIndex * 3 + actionIndex))
  ].slice(0, 4);
}

function sectionText(slide: StoryboardSlide) {
  return [slide.title, ...slide.keyPoints, slide.speakerNotes].join(" ");
}

function contentWords(input: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "will",
    "must",
    "should",
    "because",
    "audience",
    "recommendation",
    "solution",
    "value"
  ]);

  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word));
}

function repeatedSectionWords(slides: StoryboardSlide[], sections: StorySection[]) {
  const counts = new Map<string, Set<StorySection>>();

  sections.forEach((section) => {
    const words = new Set(contentWords(slides.filter((slide) => slide.section === section).map(sectionText).join(" ")));
    words.forEach((word) => {
      const set = counts.get(word) ?? new Set<StorySection>();
      set.add(section);
      counts.set(word, set);
    });
  });

  return Array.from(counts.entries())
    .filter(([, sectionSet]) => sectionSet.size >= 3)
    .map(([word]) => word)
    .slice(0, 5);
}

function hasOwnerTimingCheckpoint(bullet: string) {
  return /owner\s*:/i.test(bullet) && /timing\s*:/i.test(bullet) && /checkpoint\s*:/i.test(bullet);
}

function inferCloseTakeaway(
  desiredOutcome: string | null,
  bigIdea: string | null,
  reasonsYes: string[],
  objections: string[]
) {
  const growthSignal = reasonsYes.find((item) => /regaining shares|new prospects/i.test(item));
  const trustSignal = reasonsYes.find((item) => /re-establish trust/i.test(item));
  const marketPressure = objections.find((item) => /commoditized|crowded market|price/i.test(item));

  if (desiredOutcome && growthSignal) {
    return trimSentence(
      `Approve ${lowerFirst(normalizeDecisionTarget(desiredOutcome))} to ${lowerFirst(trimSentence(growthSignal, 55))} before ${lowerFirst(
        trimSentence(marketPressure ?? "the current market hardens further", 55)
      )}.`,
      120
    );
  }

  if (bigIdea && trustSignal) {
    return trimSentence(
      `${rewriteMetaVoice(bigIdea)} now so we can ${lowerFirst(trimSentence(trustSignal, 55))}.`,
      120
    );
  }

  return null;
}

function buildHeadlineFromTakeaway(input: string, fallback: string) {
  const trimmed = ensureCompleteText(input, fallback, 88);
  if (!trimmed || topicLabelPattern.test(trimmed) || metaVoicePattern.test(trimmed) || isIncompleteSyntax(trimmed)) {
    return ensureCompleteText(fallback, "This slide needs a sharper takeaway headline.", 88);
  }
  return sentenceCase(trimmed);
}

function rewriteMetaVoice(input: string) {
  const trimmed = ensureCompleteText(input, input, 180);
  if (!trimmed) {
    return trimmed;
  }

  return trimmed
    .replace(/^The audience should believe the win is /i, "The win is ")
    .replace(/^The audience should believe /i, "")
    .replace(/^This should feel worth saying yes to because /i, "")
    .replace(/^Show how /i, "")
    .replace(/^Ground it in /i, "")
    .replace(/^Frame the story /i, "")
    .replace(/^The strategy works through /i, "");
}

function sanitizeSlideCopy(items: string[]) {
  return items
    .map((item) => sentenceCase(rewriteMetaVoice(item)))
    .filter(Boolean);
}

function buildSectionSpeakerNotes(takeaway: string, support: string[], tone: string) {
  return [takeaway, ...support].filter(Boolean).join(" ").concat(` Speak in a ${tone} tone.`);
}

function openingGambitNeedsFacts(gambit: string | null | undefined) {
  return Boolean(gambit && /not enough sharp facts/i.test(gambit));
}

function buildSectionBreakdown(storyboard: StoryboardSlide[]): Record<StorySection, number> {
  return STORY_SECTION_ORDER.reduce(
    (accumulator, section) => ({
      ...accumulator,
      [section]: storyboard.filter((slide) => slide.section === section).length
    }),
    {} as Record<StorySection, number>
  );
}

function buildStoryShapeNotes(sectionBreakdown: Record<StorySection, number>) {
  const notes: string[] = [];

  if (sectionBreakdown.openingGambit > 1) {
    notes.push("Opening Gambit expanded past one slide; tighten the hook unless there is a deliberate reason to sustain tension across two pages.");
  }
  if (sectionBreakdown.desiredOutcome !== 1) {
    notes.push("Desired Outcome should stay singular and explicit on one slide.");
  }
  if (sectionBreakdown.situation > 2) {
    notes.push("Situation is overbuilt; compress context so it frames the problem without turning into a data dump.");
  }
  if (sectionBreakdown.rootCause > 1) {
    notes.push("Root Cause should default to one slide; if it needs more space, the story may be carrying multiple causes instead of one true barrier.");
  }
  if (sectionBreakdown.bigIdea !== 1) {
    notes.push("Big Idea should stay on one high-leverage slide and read as a belief shift, not a plan.");
  }
  if (sectionBreakdown.howItWorks < 2) {
    notes.push("How It Works looks underdeveloped; TPG default is 2-4 slides so the solution has enough strategic depth.");
  }
  if (sectionBreakdown.howItWorks > 4) {
    notes.push("How It Works may be too sprawling; group actions into fewer pillars before adding more pages.");
  }
  if (sectionBreakdown.wiifm > 1) {
    notes.push("WIIFM should default to one slide; more than that usually signals benefit repetition instead of sharper audience value.");
  }
  if (sectionBreakdown.close !== 1) {
    notes.push("Close should resolve the story decisively on one slide without introducing new thinking.");
  }
  if (sectionBreakdown.actionsNextSteps !== 1) {
    notes.push("Actions & Next Steps should stay concrete and compact on one slide.");
  }

  return notes;
}

function buildStoryboard(input: CreatorGenerateInput): StoryboardSlide[] {
  let slideIndex = 1;
  const audienceLabel = input.extractedInputs.audience.roleLevel ?? "Decision-making audience";
  const tone = input.tone ?? "clear, executive, collaborative";
  const slideDeck: StoryboardSlide[] = [];
  const cleanDesiredOutcome = cleanNarrativeText(input.extractedInputs.desiredOutcome, 140);
  const cleanDraftBigIdea = cleanStrategicText(input.extractedInputs.draftBigIdea, 140);
  const cleanSituation = cleanStrategicText(input.extractedInputs.situation, 140);
  const cleanRootCause = cleanStrategicText(input.extractedInputs.rootCause, 140);
  const cleanOpeningGambit = cleanStrategicText(input.extractedInputs.draftOpeningGambit, 140);
  const cleanWiifm = cleanStrategicText(input.extractedInputs.wiifm, 140);
  const cleanReasonsYes = cleanList(input.extractedInputs.reasonsYes, 6, 80);
  const cleanReasonsNo = cleanList(input.extractedInputs.reasonsNo, 6, 80);
  const cleanProofPoints = cleanList(input.extractedInputs.proofPoints, 6, 80);
  const cleanActions = cleanList(input.extractedInputs.actions, 5, 80);
  const cleanNeeds = {
    core: cleanList(input.extractedInputs.needs.core, 4, 80),
    business: cleanList(input.extractedInputs.needs.business, 4, 80),
    personal: cleanList(input.extractedInputs.needs.personal, 4, 80)
  };
  const inferredSituation = inferSituationTakeaway(cleanNeeds, cleanReasonsNo, cleanReasonsYes);
  const inferredRootCause = inferRootCauseTakeaway(cleanNeeds, cleanReasonsNo, cleanReasonsYes);
  const inferredBigIdea = buildBeliefStatement(cleanDraftBigIdea, cleanNeeds, cleanReasonsNo, cleanReasonsYes);
  const inferredWiifm = inferWiifmTakeaway(cleanNeeds, cleanReasonsYes, cleanReasonsNo);
  const rankedAudienceBenefits = rankAudienceBenefits(cleanNeeds, cleanReasonsYes, cleanReasonsNo);
  const inferredPillars = inferHowItWorksPillars(cleanNeeds, cleanReasonsYes, cleanReasonsNo);
  const inferredOpening = inferOpeningGambitTakeaway(
    cleanSituation ?? inferredSituation,
    cleanRootCause ?? inferredRootCause,
    cleanReasonsYes,
    cleanReasonsNo,
    cleanProofPoints
  );
  const effectiveActions =
    cleanActions.length > 0 && !cleanActions.every((item) => genericCreatorPattern.test(item))
      ? cleanActions
      : inferNextActions(cleanNeeds, cleanReasonsNo);

  const titleTakeaway = buildMeetingTitle(cleanDesiredOutcome, inferredBigIdea ?? cleanDraftBigIdea, cleanReasonsYes, cleanNeeds);
  const openingTakeaway =
    buildOpeningHook(
      cleanOpeningGambit,
      inferredOpening,
      cleanRootCause ?? inferredRootCause,
      cleanReasonsYes,
      cleanReasonsNo,
      cleanProofPoints
    );
  const desiredOutcomeTakeaway =
    buildDesiredOutcomeStatement(cleanDesiredOutcome, cleanReasonsYes, cleanNeeds);
  const situationTakeaway =
    cleanSituation ??
    inferredSituation ??
    "Today’s situation creates pressure to change how the audience thinks and acts.";
  const rootCauseTakeaway =
    cleanRootCause ??
    inferredRootCause ??
    "The current path breaks down because the underlying barrier has not been addressed directly.";
  const bigIdeaTakeaway =
    inferredBigIdea ??
    "To achieve the desired result, the audience must accept a sharper belief about what will create value.";
  const wiifmTakeaway =
    cleanWiifm ??
    inferredWiifm ??
    (rankedAudienceBenefits.length
      ? `Saying yes helps the audience ${lowerFirst(joinWithAnd(rankedAudienceBenefits.map((benefit) => stripTerminalPeriod(benefit))))}.`
      : "Saying yes reduces risk and increases the odds of business impact.");
  const howItWorksTakeaway =
    inferredPillars.length > 0
      ? `The strategy works through ${joinWithAnd(inferredPillars.slice(0, 3).map((item) => lowerFirst(trimSentence(item, 55))))}.`
      : effectiveActions.length > 0
        ? `The strategy works through ${effectiveActions.slice(0, 3).join(", ")}.`
        : "The strategy works through a small set of clear, high-level pillars.";
  const closeTakeaway =
    inferCloseTakeaway(cleanDesiredOutcome, inferredBigIdea ?? cleanDraftBigIdea, cleanReasonsYes, cleanReasonsNo) ??
    inferredBigIdea ??
    cleanDesiredOutcome ??
    "The recommendation should feel clear, safe to approve, and ready to move.";
  const actionsTakeaway =
    effectiveActions.length > 0
      ? `The next step is to ${effectiveActions[0].replace(/\.$/, "").toLowerCase()}.`
      : "The next step is to confirm ownership, timing, and the first action.";

  const sectionTakeaways: Record<StorySection, string> = {
    title: titleTakeaway,
    openingGambit: openingTakeaway,
    desiredOutcome: desiredOutcomeTakeaway,
    situation: situationTakeaway,
    rootCause: rootCauseTakeaway,
    bigIdea: bigIdeaTakeaway,
    howItWorks: howItWorksTakeaway,
    wiifm: wiifmTakeaway,
    close: closeTakeaway,
    actionsNextSteps: actionsTakeaway
  };

  STORY_SECTION_ORDER.forEach((section) => {
    const count = input.sectionMapProposal.slidesBySection[section] ?? 1;
    for (let index = 0; index < count; index += 1) {
      const firstProof = cleanProofPoints[index] ?? cleanProofPoints[0];
      const firstReasonYes = cleanReasonsYes[index] ?? cleanReasonsYes[0];
      const firstReasonNo = cleanReasonsNo[index] ?? cleanReasonsNo[0];
      const sectionTakeaway = sectionTakeaways[section];
      const headlineFallback = `${STORY_SECTION_LABELS[section]} should say something sharper than the section label.`;
      let keyPoints: string[] = [];
      let visual = `Use a simple, executive-friendly visual that reinforces ${STORY_SECTION_LABELS[section].toLowerCase()}.`;
      let speakerNotes = "";

      switch (section) {
        case "title":
          keyPoints = [];
          visual = "A clean cover slide with the meeting name as the dominant element and minimal supporting text.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            `Audience: ${audienceLabel}.`,
            "Use the cover to orient the meeting, then let the Opening Gambit create the first persuasive moment."
          ], tone);
          break;
        case "openingGambit":
          keyPoints = openingGambitNeedsFacts(sectionTakeaway)
            ? [
                "We need one sharper fact, tension, quote, or contrast to earn attention."
              ]
            : [
                ensureCompleteText(sectionTakeaway, "The audience needs one sharper reason to lean in.", 105)
              ];
          visual = "A sparse, high-contrast hook slide with one idea only.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            openingGambitNeedsFacts(sectionTakeaway)
              ? "Pause and request the missing facts instead of bluffing a generic opening."
              : "Open with the hook, then use the notes to connect the tension to the Desired Outcome.",
            ...(firstProof ? [`Available proof signal: ${firstProof}.`] : []),
            ...(firstReasonNo ? [`Underlying tension: ${firstReasonNo}.`] : [])
          ], tone);
          break;
        case "desiredOutcome":
          keyPoints = sanitizeSlideCopy([
            trimSentence(sectionTakeaway, 100),
            firstReasonYes
              ? `Because ${firstReasonYes.toLowerCase()}.`
              : cleanNeeds.business[0]
                ? `Because it addresses ${lowerFirst(summarizeNeed(cleanNeeds.business[0], 70))}.`
                : "Make the approval ask explicit."
          ]);
          visual = "A decision slide that makes the ask unmistakable.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Make the yes explicit.",
            "Avoid framing this as a review, discussion, or topic."
          ], tone);
          break;
        case "situation":
          keyPoints = sanitizeSlideCopy([
            trimSentence(sectionTakeaway, 100),
            firstProof
              ? `Support it with evidence like ${firstProof.toLowerCase()}.`
              : cleanReasonsNo[0]
                ? `Ground it in market pressure like ${cleanReasonsNo[0].toLowerCase()}.`
                : "Support it with one proof point that grounds the situation."
          ]);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Frame what is happening now and why it matters.",
            "Do not drift into the recommendation yet."
          ], tone);
          break;
        case "rootCause":
          keyPoints = sanitizeSlideCopy([
            trimSentence(sectionTakeaway, 100),
            firstReasonNo
              ? `The audience may resist because ${firstReasonNo.toLowerCase()}.`
              : cleanNeeds.personal[0]
                ? `The audience may hesitate because the story does not yet reduce ${cleanNeeds.personal[0].toLowerCase()}.`
                : "Name the friction that keeps the situation in place."
          ]);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Translate symptoms into the underlying barrier or tension.",
            "Set up the belief shift the Big Idea must solve."
          ], tone);
          break;
        case "bigIdea":
          keyPoints = sanitizeSlideCopy([
            trimSentence(sectionTakeaway, 120)
          ]);
          visual = "A simple bridge visual that connects the current barrier to the new belief.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Keep the Big Idea belief-based, not action-based.",
            "If it sounds like a tactic, rewrite it."
          ], tone);
          break;
        case "howItWorks":
          {
            const pillarSlice = inferredPillars.slice(index, index + 1);
            const needFallback = [
              cleanNeeds.core[index],
              cleanNeeds.business[index],
              cleanNeeds.personal[index]
            ]
              .filter((item): item is string => Boolean(item))
              .map((need) => `Address ${lowerFirst(summarizeNeed(need, 70))}.`);

          keyPoints = sanitizeSlideCopy([
            ...pillarSlice.map((pillar) => sentenceCase(trimSentence(pillar, 80))),
            ...(pillarSlice.length
              ? []
              : needFallback.length
                ? needFallback
                : ["Translate the belief into a few strategic pillars that make the approach workable."])
          ]).slice(0, 4);
          visual = "A 2-4 pillar framework or simple operating model.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Show the strategic pillars, not a detailed workplan.",
            "Actions & ownership come later."
          ], tone);
          break;
          }
        case "wiifm":
          keyPoints = sanitizeSlideCopy([
            ...(rankedAudienceBenefits.length
              ? rankedAudienceBenefits
              : [trimSentence(sectionTakeaway, 100)])
          ]).slice(0, 3);
          visual = "A benefit translation slide that turns the recommendation into audience value.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Translate the recommendation into value for this audience.",
            "Use business and personal value where appropriate."
          ], tone);
          break;
        case "close":
          keyPoints = sanitizeSlideCopy([
            ensureCompleteText(sectionTakeaway, closeTakeaway, 125),
            `Ask: ${ensureCompleteText(desiredOutcomeTakeaway, "Approve the recommendation so the team can move forward with clear business impact.", 130)}`,
            cleanReasonsYes[0]
              ? `Value: ${sentenceCase(ensureCompleteText(cleanReasonsYes[0], "Move forward with a clearer path to business impact.", 120))}.`
              : "Value: Move forward with a clearer path to business impact.",
            cleanReasonsNo[0]
              ? `Why now: ${sentenceCase(ensureCompleteText(cleanReasonsNo[0], "Waiting keeps the current barrier in place.", 120))}.`
              : "Why now: Waiting keeps the current barrier in place."
          ]);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Reinforce the recommendation and why now.",
            "Set up the final ask cleanly."
          ], tone);
          break;
        case "actionsNextSteps":
          keyPoints = sanitizeSlideCopy([
            ...buildActionSlideBullets(
              effectiveActions.length ? effectiveActions : ["Confirm the first action and decision owner"],
              index,
              count
            )
          ]).slice(0, 4);
          visual = "A simple next-step table with action, owner, and timing.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Be specific about owners, timing, and accountability.",
            "Keep this operational and concrete."
          ], tone);
          break;
      }

      const derivedHeadline = buildHeadlineFromTakeaway(
        section === "howItWorks" || section === "actionsNextSteps"
          ? keyPoints[0] ?? sectionTakeaway
          : sectionTakeaway,
        headlineFallback
      );

      slideDeck.push({
        slideIndex,
        section,
        title: derivedHeadline,
        keyPoints,
        visual,
        speakerNotes
      });
      slideIndex += 1;
    }
  });

  return slideDeck;
}

function applyCreatorQualityGate(input: CreatorGenerateInput, storyboard: StoryboardSlide[]) {
  const notes: string[] = [];
  const cleanReasonsYes = cleanList(input.extractedInputs.reasonsYes, 6, 80);
  const cleanReasonsNo = cleanList(input.extractedInputs.reasonsNo, 6, 80);
  const cleanNeeds = {
    core: cleanList(input.extractedInputs.needs.core, 4, 80),
    business: cleanList(input.extractedInputs.needs.business, 4, 80),
    personal: cleanList(input.extractedInputs.needs.personal, 4, 80)
  };
  const cleanDesiredOutcome = cleanNarrativeText(input.extractedInputs.desiredOutcome, 140);
  const desiredOutcomeStatement = buildDesiredOutcomeStatement(cleanDesiredOutcome, cleanReasonsYes, cleanNeeds);
  const beliefStatement = buildBeliefStatement(input.extractedInputs.draftBigIdea, cleanNeeds, cleanReasonsNo, cleanReasonsYes);
  const rankedBenefits = rankAudienceBenefits(cleanNeeds, cleanReasonsYes, cleanReasonsNo);
  const meetingTitle = buildMeetingTitle(cleanDesiredOutcome, beliefStatement, cleanReasonsYes, cleanNeeds);
  const openingHook = buildOpeningHook(
    cleanStrategicText(input.extractedInputs.draftOpeningGambit, 140),
    inferOpeningGambitTakeaway(
      cleanStrategicText(input.extractedInputs.situation, 140),
      cleanStrategicText(input.extractedInputs.rootCause, 140),
      cleanReasonsYes,
      cleanReasonsNo,
      cleanList(input.extractedInputs.proofPoints, 6, 80)
    ),
    cleanStrategicText(input.extractedInputs.rootCause, 140),
    cleanReasonsYes,
    cleanReasonsNo,
    cleanList(input.extractedInputs.proofPoints, 6, 80)
  );
  const effectiveActions =
    cleanList(input.extractedInputs.actions, 5, 80).length > 0
      ? cleanList(input.extractedInputs.actions, 5, 80)
      : inferNextActions(cleanNeeds, cleanReasonsNo);
  const totalActionSlides = storyboard.filter((slide) => slide.section === "actionsNextSteps").length;
  let actionSlideIndex = 0;

  const repaired = storyboard.map((slide, index) => {
    const originalTitleIncomplete = isIncompleteSyntax(slide.title);
    const originalBulletsIncomplete = slide.keyPoints.some(isIncompleteSyntax);
    const originalNotesIncomplete = isIncompleteSyntax(slide.speakerNotes);
    const nextSlide: StoryboardSlide = {
      ...slide,
      slideIndex: index + 1,
      title: buildHeadlineFromTakeaway(rewriteMetaVoice(slide.title), `${STORY_SECTION_LABELS[slide.section]} should say something sharper than the section label.`),
      keyPoints: sanitizeSlideCopy(slide.keyPoints),
      speakerNotes: rewriteMetaVoice(slide.speakerNotes)
    };

    if (isIncompleteSyntax(nextSlide.title)) {
      notes.push("Quality gate replaced an unfinished slide title.");
      nextSlide.title = buildHeadlineFromTakeaway("", `${STORY_SECTION_LABELS[nextSlide.section]} needs a complete takeaway.`);
    }
    if (nextSlide.keyPoints.some(isIncompleteSyntax)) {
      notes.push("Quality gate removed unfinished bullet fragments.");
      nextSlide.keyPoints = nextSlide.keyPoints
        .map((point) => ensureCompleteText(point, "", 120))
        .filter((point) => !isIncompleteSyntax(point));
    }
    if (originalNotesIncomplete || isIncompleteSyntax(nextSlide.speakerNotes)) {
      notes.push("Quality gate replaced unfinished speaker notes.");
      nextSlide.speakerNotes = buildSectionSpeakerNotes(nextSlide.title, nextSlide.keyPoints.slice(0, 2), input.tone ?? "clear, executive, collaborative");
    }

    if (nextSlide.section === "title") {
      if (nextSlide.keyPoints.length > 0 || actionVerbPattern.test(nextSlide.title)) {
        notes.push("Quality gate simplified Title section into a clean meeting-name slide.");
      }
      nextSlide.title = buildHeadlineFromTakeaway(meetingTitle, "Strategic Alignment Discussion");
      nextSlide.keyPoints = [];
      nextSlide.visual = "A clean cover slide with the meeting name as the dominant element and minimal supporting text.";
      nextSlide.speakerNotes = buildSectionSpeakerNotes(nextSlide.title, [
        "Use the cover to orient the meeting.",
        "Let the Opening Gambit carry the first persuasive hook."
      ], input.tone ?? "clear, executive, collaborative");
    }

    if (nextSlide.section === "openingGambit") {
      if (nextSlide.keyPoints.length > 1 || genericCreatorPattern.test(sectionText(nextSlide))) {
        notes.push("Quality gate tightened Opening Gambit to one visible hook.");
      }
      nextSlide.title = buildHeadlineFromTakeaway(openingHook, "The opening needs one sharper reason to lean in.");
      nextSlide.keyPoints = [openingHook];
    }

    if (nextSlide.section === "desiredOutcome") {
      const combined = sectionText(nextSlide);
      const isDiffuse = combined.length > 420 || (combined.match(/\b(approve|align|endorse|commit|understand|pursue)\b/gi) ?? []).length > 2;
      if (!actionVerbPattern.test(combined) || isDiffuse || originalTitleIncomplete || originalBulletsIncomplete) {
        notes.push("Quality gate tightened Desired Outcome into one concise decision or understanding statement.");
        nextSlide.title = buildHeadlineFromTakeaway(desiredOutcomeStatement, "Align on the decision this story needs to support.");
        nextSlide.keyPoints = [desiredOutcomeStatement];
      }
    }

    if (nextSlide.section === "bigIdea") {
      const combined = sectionText(nextSlide);
      const looksLikePlan = solutionDescriptionPattern.test(combined) || nextSlide.keyPoints.length > 1;
      if (looksLikePlan || !/\b(to|if|when|must|requires|only|not)\b/i.test(combined)) {
        notes.push("Quality gate kept Big Idea as one belief sentence instead of a plan or solution description.");
        nextSlide.title = buildHeadlineFromTakeaway(beliefStatement, "The audience needs one belief shift before the plan feels obvious.");
        nextSlide.keyPoints = [beliefStatement];
        nextSlide.speakerNotes = buildSectionSpeakerNotes(beliefStatement, [
          "Use this as the bridge from diagnosis to the operating plan."
        ], input.tone ?? "clear, executive, collaborative");
      } else {
        nextSlide.keyPoints = [trimSentence(rewriteMetaVoice(nextSlide.keyPoints[0] ?? nextSlide.title), 125)];
      }
    }

    if (nextSlide.section === "howItWorks") {
      const filtered = nextSlide.keyPoints.filter(
        (point) => !hasOwnerTimingCheckpoint(point) && !/^(approve|assign|schedule|launch|pilot|commit|meet with|confirm)\b/i.test(point)
      );
      if (filtered.length !== nextSlide.keyPoints.length) {
        notes.push("Quality gate removed workplan leakage from How It Works.");
      }
      nextSlide.keyPoints = (filtered.length > 0 ? filtered : nextSlide.keyPoints).slice(0, 4);
    }

    if (nextSlide.section === "wiifm") {
      const featureHeavy = nextSlide.keyPoints.some((point) => solutionDescriptionPattern.test(point) && !benefitVerbPattern.test(point));
      if (rankedBenefits.length > 0 && (featureHeavy || nextSlide.keyPoints.length > 3)) {
        notes.push("Quality gate recast WIIFM as top audience outcomes rather than solution attributes.");
        nextSlide.keyPoints = rankedBenefits;
      } else {
        nextSlide.keyPoints = nextSlide.keyPoints.slice(0, 3);
      }
    }

    if (nextSlide.section === "close") {
      const combined = sectionText(nextSlide);
      const hasAsk = actionVerbPattern.test(combined);
      const hasNow = /now|before|urgent|risk|stakes|waiting|delay/i.test(combined);
      if (!hasAsk || !hasNow) {
        notes.push("Quality gate strengthened Close with ask, value, and why-now logic.");
        nextSlide.keyPoints = sanitizeSlideCopy([
          `Ask: ${desiredOutcomeStatement}`,
          cleanReasonsYes[0] ? `Value: ${sentenceCase(ensureCompleteText(cleanReasonsYes[0], "Move forward with clearer business impact.", 120))}.` : "Value: Move forward with clearer business impact.",
          cleanReasonsNo[0] ? `Why now: ${sentenceCase(ensureCompleteText(cleanReasonsNo[0], "Waiting keeps the current barrier in place.", 120))}.` : "Why now: Waiting keeps the current barrier in place."
        ]);
      }
    }

    if (nextSlide.section === "actionsNextSteps") {
      const localActionSlideIndex = actionSlideIndex;
      actionSlideIndex += 1;
      const actionBullets = buildActionSlideBullets(
        effectiveActions.length > 0 ? effectiveActions : ["Confirm the first action and decision owner"],
        localActionSlideIndex,
        totalActionSlides
      );
      if (totalActionSlides > 1 || !nextSlide.keyPoints.every((point) => point.startsWith("Purpose:") || hasOwnerTimingCheckpoint(point))) {
        notes.push("Quality gate added owner, timing, checkpoint, and distinct slide-purpose discipline to Actions & Next Steps.");
        nextSlide.keyPoints = actionBullets;
      }
      if (totalActionSlides > 1 && localActionSlideIndex > 0) {
        nextSlide.title = buildHeadlineFromTakeaway(actionBullets[0].replace(/^Purpose:\s*/i, ""), "Advance the next execution phase.");
      }
    }

    if (isIncompleteSyntax(nextSlide.title)) {
      nextSlide.title = buildHeadlineFromTakeaway("", `${STORY_SECTION_LABELS[nextSlide.section]} needs a complete takeaway.`);
    }
    if (nextSlide.keyPoints.some(isIncompleteSyntax)) {
      nextSlide.keyPoints = nextSlide.keyPoints
        .map((point) => ensureCompleteText(point, "", 140))
        .filter((point) => !isIncompleteSyntax(point));
    }
    if (isIncompleteSyntax(nextSlide.speakerNotes)) {
      nextSlide.speakerNotes = buildSectionSpeakerNotes(nextSlide.title, nextSlide.keyPoints.slice(0, 2), input.tone ?? "clear, executive, collaborative");
    }

    return nextSlide;
  });

  const repeatedWords = repeatedSectionWords(repaired, ["bigIdea", "howItWorks", "wiifm", "close", "actionsNextSteps"]);
  if (repeatedWords.length > 0) {
    notes.push(`Quality gate flagged potential section overlap around repeated terms: ${repeatedWords.join(", ")}.`);
  }

  return {
    storyboard: repaired,
    notes: Array.from(new Set(notes))
  };
}

export async function runCreatorGenerate(input: CreatorGenerateInput) {
  const fallbackQuality = applyCreatorQualityGate(input, buildStoryboard(input));
  const storyboard = fallbackQuality.storyboard;
  const sectionBreakdown = buildSectionBreakdown(storyboard);
  const selfCheck = {
    totalSlidesGenerated: storyboard.length,
    sectionBreakdown,
    withinTolerance: Math.abs(storyboard.length - input.sectionMapProposal.totalSlides) <= 4,
    notes: [
      "Big Idea is designed as a belief shift rather than a tactic.",
      "Desired Outcome is constrained to one concise decision or understanding statement.",
      "WIIFM is limited to ranked audience outcomes, not solution attributes.",
      "Actions & Next Steps include owner, timing, and accountability checkpoints.",
      "Headlines are written as takeaway statements rather than section labels.",
      "Storyboard follows the canonical TPG story flow, including WIIFM and Actions & Next Steps.",
      ...fallbackQuality.notes,
      ...buildStoryShapeNotes(sectionBreakdown)
    ]
  };

  const prompt = buildCreatorGeneratePrompt({
    requestedTone: input.tone,
    summary: JSON.stringify({
      extractedInputs: input.extractedInputs,
      sectionMap: input.sectionMapProposal,
      artifactsUsed: input.artifactsUsed ?? []
    })
  });

  try {
    const response = await callLLM(prompt, {
      schema: creatorGenerateResponseSchema,
      fallback: () => ({
        creatorVersion: "v2" as const,
        generationSource: "fallback" as const,
        sectionMap: input.sectionMapProposal,
        storyboard,
        selfCheck,
        artifactsUsed: input.artifactsUsed
      })
    });
    const llmQuality = applyCreatorQualityGate(input, response.storyboard);
    const llmBreakdown = buildSectionBreakdown(llmQuality.storyboard);
    return creatorGenerateResponseSchema.parse({
      ...response,
      storyboard: llmQuality.storyboard,
      selfCheck: {
        ...response.selfCheck,
        totalSlidesGenerated: llmQuality.storyboard.length,
        sectionBreakdown: llmBreakdown,
        notes: Array.from(new Set([...(response.selfCheck?.notes ?? []), ...llmQuality.notes]))
      },
      generationSource: response.generationSource ?? "llm"
    });
  } catch (error) {
    console.warn("[Deckspert][Creator][Generate] Falling back to local storyboard output", {
      error: error instanceof Error ? error.message : error
    });
    return creatorGenerateResponseSchema.parse({
      creatorVersion: "v2",
      generationSource: "fallback",
      sectionMap: input.sectionMapProposal,
      storyboard,
      selfCheck,
      artifactsUsed: input.artifactsUsed
    });
  }
}
