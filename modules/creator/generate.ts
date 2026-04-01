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
  if (!trimmed || topicLabelPattern.test(trimmed)) {
    return fallback;
  }
  return sentenceCase(trimmed);
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
  const titleTakeaway =
    input.extractedInputs.draftBigIdea ??
    input.extractedInputs.desiredOutcome ??
    input.extractedInputs.situation ??
    "Create a sharper, audience-specific business story.";
  const openingTakeaway =
    input.extractedInputs.draftOpeningGambit ??
    "Why now has not been framed sharply enough yet.";
  const desiredOutcomeTakeaway =
    input.extractedInputs.desiredOutcome ??
    "The audience should say yes to a clear direction and the next move.";
  const situationTakeaway = input.extractedInputs.situation ?? "Today’s situation creates pressure to change how the audience thinks and acts.";
  const rootCauseTakeaway = input.extractedInputs.rootCause ?? "The current path breaks down because the underlying barrier has not been addressed directly.";
  const bigIdeaTakeaway =
    input.extractedInputs.draftBigIdea ??
    "To achieve the desired result, the audience must accept a sharper belief about what will create value.";
  const wiifmTakeaway =
    input.extractedInputs.wiifm ??
    (input.extractedInputs.reasonsYes.length
      ? `Saying yes creates ${input.extractedInputs.reasonsYes.slice(0, 2).join(" and ")}.`
      : "Saying yes reduces risk and increases the odds of business impact.");
  const howItWorksTakeaway =
    input.extractedInputs.actions.length > 0
      ? `The strategy works through ${input.extractedInputs.actions.slice(0, 3).join(", ")}.`
      : "The strategy works through a small set of clear, high-level pillars.";
  const closeTakeaway =
    input.extractedInputs.desiredOutcome ??
    "The recommendation should feel clear, safe to approve, and ready to move.";
  const actionsTakeaway =
    input.extractedInputs.actions.length > 0
      ? `The next step is to ${input.extractedInputs.actions[0].replace(/\.$/, "").toLowerCase()}.`
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
            "Frame the story in one line before moving into the hook.",
            "Anchor the title in the business result the audience should care about."
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
              : "Open with curiosity, tension, or urgency before moving into data."
          ], tone);
          break;
        case "desiredOutcome":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            firstReasonYes ? `This should feel worth saying yes to because ${firstReasonYes.toLowerCase()}.` : "Make the approval ask explicit."
          ];
          visual = "A decision slide that makes the ask unmistakable.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Make the yes explicit.",
            "Avoid framing this as a review, discussion, or topic."
          ], tone);
          break;
        case "situation":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            firstProof ? `Support it with evidence like ${firstProof.toLowerCase()}.` : "Support it with one proof point that grounds the situation."
          ];
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Frame what is happening now and why it matters.",
            "Do not drift into the recommendation yet."
          ], tone);
          break;
        case "rootCause":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            firstReasonNo ? `The audience may resist because ${firstReasonNo.toLowerCase()}.` : "Name the friction that keeps the situation in place."
          ];
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Translate symptoms into the underlying barrier or tension.",
            "Set up the belief shift the Big Idea must solve."
          ], tone);
          break;
        case "bigIdea":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            "This should sound like a belief the audience must accept before action feels obvious."
          ];
          visual = "A simple bridge visual that connects the current barrier to the new belief.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Keep the Big Idea belief-based, not action-based.",
            "If it sounds like a tactic, rewrite it."
          ], tone);
          break;
        case "howItWorks":
          keyPoints = [
            ...input.extractedInputs.actions.slice(index * 3, index * 3 + 3).map((action) => sentenceCase(trimSentence(action, 70))),
            ...(input.extractedInputs.actions.length ? [] : ["Show the 2-4 strategic pillars that make the Big Idea operational."])
          ].slice(0, 4);
          visual = "A 2-4 pillar framework or simple operating model.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Show the strategic pillars, not a detailed workplan.",
            "Actions & ownership come later."
          ], tone);
          break;
        case "wiifm":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            ...input.extractedInputs.reasonsYes.slice(index, index + 2).map((reason) => sentenceCase(trimSentence(reason, 70)))
          ].slice(0, 3);
          visual = "A benefit translation slide that turns the recommendation into audience value.";
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Translate the recommendation into value for this audience.",
            "Use business and personal value where appropriate."
          ], tone);
          break;
        case "close":
          keyPoints = [
            trimSentence(sectionTakeaway, 100),
            "Make the recommendation feel safe, important, and easy to approve now."
          ];
          speakerNotes = buildSectionSpeakerNotes(sectionTakeaway, [
            "Reinforce the recommendation and why now.",
            "Set up the final ask cleanly."
          ], tone);
          break;
        case "actionsNextSteps":
          keyPoints = [
            ...input.extractedInputs.actions.slice(index * 3, index * 3 + 3).map((action) => sentenceCase(trimSentence(action, 70))),
            ...(input.extractedInputs.actions.length ? [] : ["Name the first action, owner, and timing."])
          ].slice(0, 4);
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
