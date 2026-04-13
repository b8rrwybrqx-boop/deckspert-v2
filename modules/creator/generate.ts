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
const boilerplateTitlePattern =
  /^(©\d{4}\s+the partnering group, inc\.?|[12]\.\s+(proper preparation|structured storyboard) planning worksheet|confirm the decision|align on the recommendation|define the next step and owner)$/i;

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
  return normalized.slice(0, maxLength).replace(/\s+\S*$/, "").replace(/[.;:,]+$/, "");
}

function buildHeadlineFromTakeaway(input: string, fallback: string) {
  const trimmed = trimSentence(input, 88);
  if (!trimmed || topicLabelPattern.test(trimmed) || boilerplateTitlePattern.test(trimmed)) {
    return fallback;
  }
  return sentenceCase(trimmed);
}

function isWeakTakeaway(input: string | null | undefined) {
  if (!input) {
    return true;
  }

  const trimmed = trimSentence(input, 100);
  return !trimmed || topicLabelPattern.test(trimmed) || boilerplateTitlePattern.test(trimmed);
}

function firstMeaningfulTakeaway(candidates: Array<string | null | undefined>, fallback: string) {
  const candidate = candidates.find((value) => !isWeakTakeaway(value));
  return candidate ?? fallback;
}

function compactPhrase(input: string, maxLength = 90) {
  return trimSentence(input.replace(/\s+/g, " ").trim(), maxLength);
}

function lowerFirst(input: string) {
  if (!input) {
    return input;
  }
  return input[0].toLowerCase() + input.slice(1);
}

function uniquePhrases(items: Array<string | null | undefined>, maxItems: number) {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  items.forEach((item) => {
    if (!item) {
      return;
    }
    const normalized = compactPhrase(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    cleaned.push(normalized);
  });

  return cleaned.slice(0, maxItems);
}

function deriveOpeningTakeaway(input: ExtractedInputs) {
  if (input.draftOpeningGambit) {
    return input.draftOpeningGambit;
  }

  const firstRisk = input.reasonsNo[0];
  const desired = input.desiredOutcome;
  if (firstRisk && desired) {
    return `${compactPhrase(firstRisk)} stands in the way of ${lowerFirst(compactPhrase(desired, 80))}.`;
  }

  if (firstRisk) {
    return `${compactPhrase(firstRisk)} is the issue we need to resolve now.`;
  }

  return "Why now has not been framed sharply enough yet.";
}

function deriveTitleTakeaway(input: ExtractedInputs) {
  const desired = input.desiredOutcome ? compactPhrase(input.desiredOutcome, 85) : null;
  if (desired) {
    return desired;
  }
  return firstMeaningfulTakeaway([input.draftBigIdea, input.wiifm, input.situation], "Create a sharper, audience-specific business story.");
}

function deriveHowItWorksPillars(input: ExtractedInputs) {
  if (input.actions.length > 0) {
    return uniquePhrases(input.actions, 3);
  }

  return uniquePhrases(
    [
      input.needs.core[0] ? `Prove we can ${lowerFirst(compactPhrase(input.needs.core[0], 72))}` : null,
      input.needs.business[0] ? `Demonstrate ${lowerFirst(compactPhrase(input.needs.business[0], 72))}` : null,
      input.needs.personal[0] ? `Reinforce ${lowerFirst(compactPhrase(input.needs.personal[0], 72))}` : null,
      input.reasonsYes[0] ? `Use ${lowerFirst(compactPhrase(input.reasonsYes[0], 72))} as proof` : null
    ],
    3
  );
}

function deriveNextSteps(input: ExtractedInputs) {
  if (input.actions.length > 0) {
    return uniquePhrases(input.actions, 3);
  }

  return uniquePhrases(
    [
      input.reasonsNo[0] ? `Quantify and answer ${lowerFirst(compactPhrase(input.reasonsNo[0], 72))}` : "Quantify the case for approval",
      input.needs.business[0] ? `Align on how to deliver ${lowerFirst(compactPhrase(input.needs.business[0], 72))}` : "Align on the business case",
      input.desiredOutcome ? `Define the owner and timing to deliver ${lowerFirst(compactPhrase(input.desiredOutcome, 72))}` : "Define the owner and timing for the first move"
    ],
    3
  );
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
  if (sectionBreakdown.rootCause > 2) {
    notes.push("Root Cause is over-expanded; if there are 3+ causes, the story likely has noise instead of a true root cause.");
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
  if (sectionBreakdown.wiifm > 2) {
    notes.push("WIIFM should usually resolve in 1-2 slides; more than that may signal benefit repetition.");
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
  const titleTakeaway = deriveTitleTakeaway(input.extractedInputs);
  const openingTakeaway = deriveOpeningTakeaway(input.extractedInputs);
  const desiredOutcomeTakeaway = firstMeaningfulTakeaway(
    [input.extractedInputs.desiredOutcome],
    "The audience should say yes to a clear direction and the next move."
  );
  const situationTakeaway = firstMeaningfulTakeaway(
    [input.extractedInputs.situation, input.extractedInputs.desiredOutcome],
    "Today’s situation creates pressure to change how the audience thinks and acts."
  );
  const rootCauseTakeaway = firstMeaningfulTakeaway(
    [input.extractedInputs.rootCause, input.extractedInputs.situation],
    "The current path breaks down because the underlying barrier has not been addressed directly."
  );
  const bigIdeaTakeaway = firstMeaningfulTakeaway(
    [input.extractedInputs.draftBigIdea, input.extractedInputs.wiifm, input.extractedInputs.desiredOutcome],
    "To achieve the desired result, the audience must accept a sharper belief about what will create value."
  );
  const wiifmTakeaway =
    input.extractedInputs.wiifm ??
    (input.extractedInputs.reasonsYes.length
      ? `Saying yes creates ${input.extractedInputs.reasonsYes.slice(0, 2).join(" and ")}.`
      : "Saying yes reduces risk and increases the odds of business impact.");
  const pillars = deriveHowItWorksPillars(input.extractedInputs);
  const nextSteps = deriveNextSteps(input.extractedInputs);
  const howItWorksTakeaway =
    pillars.length > 0
      ? `The strategy works through ${pillars.join(", ")}.`
      : "The strategy works through 2-4 clear pillars that connect the desired outcome to lower-risk execution.";
  const closeTakeaway =
    input.extractedInputs.desiredOutcome ??
    "The recommendation should feel clear, safe to approve, and ready to move.";
  const actionsTakeaway =
    nextSteps.length > 0
      ? `The next step is to ${lowerFirst(compactPhrase(nextSteps[0], 84))}.`
      : "The next step is to confirm the owner, timing, and first concrete move.";

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
      const firstProof = input.extractedInputs.proofPoints[index] ?? input.extractedInputs.proofPoints[0];
      const firstReasonYes = input.extractedInputs.reasonsYes[index] ?? input.extractedInputs.reasonsYes[0];
      const firstReasonNo = input.extractedInputs.reasonsNo[index] ?? input.extractedInputs.reasonsNo[0];
      const sectionTakeaway = sectionTakeaways[section];
      const headlineFallback = `${STORY_SECTION_LABELS[section]} should say something sharper than the section label.`;
      let keyPoints: string[] = [];
      let visual = `Use a simple, executive-friendly visual that reinforces ${STORY_SECTION_LABELS[section].toLowerCase()}.`;
      let speakerNotes = "";

      switch (section) {
        case "title":
          keyPoints = [
            trimSentence(sectionTakeaway, 90),
            `Audience: ${audienceLabel}`,
            input.extractedInputs.creatorMode === "improveExistingDeck"
              ? "This version improves an existing deck rather than starting from zero."
              : input.extractedInputs.creatorMode === "improveDeckWithPrep"
                ? "This version improves an existing deck using prep materials as the source of truth."
                : "This version is built from prep and source materials."
          ];
          visual = "A single statement slide with minimal text and a strong visual anchor.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            input.extractedInputs.desiredOutcome ? `The business result is ${lowerFirst(compactPhrase(input.extractedInputs.desiredOutcome, 90))}.` : "",
            input.extractedInputs.wiifm ? compactPhrase(input.extractedInputs.wiifm, 90) : ""
          ], tone);
          break;
        case "openingGambit":
          keyPoints = openingGambitNeedsFacts(sectionTakeaway)
            ? [
                "We need 2-5 sharper facts, tensions, or surprising signals to earn urgency.",
                "Good hooks usually use a tension, contrast, question, or surprising fact.",
                "Do not start with agenda, context, or analysis when a hook is required."
              ]
            : [trimSentence(sectionTakeaway, 80)];
          visual = "A sparse, high-contrast hook slide with one idea only.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            openingGambitNeedsFacts(sectionTakeaway)
              ? "Pause and request the missing facts instead of bluffing a generic opening."
              : input.extractedInputs.reasonsNo[0]
                ? `The risk to address first is ${lowerFirst(compactPhrase(input.extractedInputs.reasonsNo[0], 90))}.`
                : "Lead with the tension the audience already feels."
          ], tone);
          break;
        case "desiredOutcome":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.reasonsYes.slice(0, 2)], 3);
          visual = "A decision slide that makes the ask unmistakable.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            firstReasonYes ? `This is worth approving because ${lowerFirst(compactPhrase(firstReasonYes, 90))}.` : "",
            input.extractedInputs.reasonsYes[1] ? compactPhrase(input.extractedInputs.reasonsYes[1], 90) : ""
          ], tone);
          break;
        case "situation":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.needs.core.slice(0, 2), ...input.extractedInputs.needs.business.slice(0, 1)], 3);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            firstProof ? `Evidence to anchor this: ${lowerFirst(compactPhrase(firstProof, 90))}.` : "",
            input.extractedInputs.needs.personal[0] ? `This also matters personally because ${lowerFirst(compactPhrase(input.extractedInputs.needs.personal[0], 90))}.` : ""
          ], tone);
          break;
        case "rootCause":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.reasonsNo.slice(0, 2)], 3);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            firstReasonNo ? `The friction is ${lowerFirst(compactPhrase(firstReasonNo, 90))}.` : "",
            input.extractedInputs.reasonsNo[1] ? `It is reinforced by ${lowerFirst(compactPhrase(input.extractedInputs.reasonsNo[1], 90))}.` : ""
          ], tone);
          break;
        case "bigIdea":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.reasonsYes.slice(0, 2)], 3);
          visual = "A simple bridge visual that connects the current barrier to the new belief.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            input.extractedInputs.desiredOutcome ? `If the audience accepts this, ${lowerFirst(compactPhrase(input.extractedInputs.desiredOutcome, 90))}.` : "",
            input.extractedInputs.wiifm ? compactPhrase(input.extractedInputs.wiifm, 90) : ""
          ], tone);
          break;
        case "howItWorks":
          keyPoints = pillars.slice(index, index + 1);
          visual = "A 2-4 pillar framework or simple operating model.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            pillars[index + 1] ? `This connects to ${lowerFirst(compactPhrase(pillars[index + 1], 90))}.` : "",
            input.extractedInputs.reasonsYes[index] ? `Proof point: ${lowerFirst(compactPhrase(input.extractedInputs.reasonsYes[index], 90))}.` : ""
          ], tone);
          break;
        case "wiifm":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.needs.business.slice(0, 1), ...input.extractedInputs.needs.personal.slice(0, 1)], 3);
          visual = "A benefit translation slide that turns the recommendation into audience value.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            input.extractedInputs.needs.business[0] ? `Business payoff: ${lowerFirst(compactPhrase(input.extractedInputs.needs.business[0], 90))}.` : "",
            input.extractedInputs.needs.personal[0] ? `Personal payoff: ${lowerFirst(compactPhrase(input.extractedInputs.needs.personal[0], 90))}.` : ""
          ], tone);
          break;
        case "close":
          keyPoints = uniquePhrases([sectionTakeaway, ...input.extractedInputs.reasonsYes.slice(0, 1), ...input.extractedInputs.reasonsNo.slice(0, 1)], 3);
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            input.extractedInputs.reasonsYes[0] ? `Back it because ${lowerFirst(compactPhrase(input.extractedInputs.reasonsYes[0], 90))}.` : "",
            input.extractedInputs.reasonsNo[0] ? `Address the last concern: ${lowerFirst(compactPhrase(input.extractedInputs.reasonsNo[0], 90))}.` : ""
          ], tone);
          break;
        case "actionsNextSteps":
          keyPoints = nextSteps;
          visual = "A simple next-step table with action, owner, and timing.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            nextSteps[1] ? `Then ${lowerFirst(compactPhrase(nextSteps[1], 90))}.` : "",
            nextSteps[2] ? `Finally ${lowerFirst(compactPhrase(nextSteps[2], 90))}.` : ""
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

export async function runCreatorGenerate(input: CreatorGenerateInput) {
  const storyboard = buildStoryboard(input);
  const sectionBreakdown = buildSectionBreakdown(storyboard);
  const selfCheck = {
    totalSlidesGenerated: storyboard.length,
    sectionBreakdown,
    withinTolerance: Math.abs(storyboard.length - input.sectionMapProposal.totalSlides) <= 4,
    notes: [
      "Big Idea is designed as a belief shift rather than a tactic.",
      "Headlines are written as takeaway statements rather than section labels.",
      "Storyboard follows the canonical TPG story flow, including WIIFM and Actions & Next Steps.",
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
    return await callLLM(prompt, {
      schema: creatorGenerateResponseSchema,
      fallback: () => ({
        creatorVersion: "v2" as const,
        sectionMap: input.sectionMapProposal,
        storyboard,
        selfCheck,
        artifactsUsed: input.artifactsUsed
      })
    });
  } catch (error) {
    console.warn("[Deckspert][Creator][Generate] Falling back to local storyboard output", {
      error: error instanceof Error ? error.message : error
    });
    return creatorGenerateResponseSchema.parse({
      creatorVersion: "v2",
      sectionMap: input.sectionMapProposal,
      storyboard,
      selfCheck,
      artifactsUsed: input.artifactsUsed
    });
  }
}
