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

function buildSectionBreakdown(storyboard: StoryboardSlide[]): Record<StorySection, number> {
  return STORY_SECTION_ORDER.reduce(
    (accumulator, section) => ({
      ...accumulator,
      [section]: storyboard.filter((slide) => slide.section === section).length
    }),
    {} as Record<StorySection, number>
  );
}

function buildStoryboard(input: CreatorGenerateInput): StoryboardSlide[] {
  let slideIndex = 1;
  const audienceLabel = input.extractedInputs.audience.roleLevel ?? "Decision-making audience";
  const slideDeck: StoryboardSlide[] = [];
  const sectionSummaries: Record<StorySection, string> = {
    openingGambit: "Lead with the commercial tension or opportunity that makes the audience care now.",
    desiredOutcome:
      input.extractedInputs.desiredOutcome ??
      "Clarify the decision or commitment the audience needs to make.",
    situation: input.extractedInputs.situation ?? "Frame what is happening today and why it matters.",
    rootCause: input.extractedInputs.rootCause ?? "Name the underlying barrier that must be solved.",
    bigIdea:
      input.extractedInputs.draftBigIdea ??
      "State the belief the audience must accept before the plan feels obvious.",
    howItWorks:
      input.extractedInputs.actions.length > 0
        ? input.extractedInputs.actions.join("; ")
        : "Lay out the high-level plan in a few clear moves.",
    close:
      input.extractedInputs.actions.length > 0
        ? `Close with the ask and next step: ${input.extractedInputs.actions.join("; ")}`
        : "Restate the recommendation and ask for alignment."
  };

  STORY_SECTION_ORDER.forEach((section) => {
    const count = input.sectionMapProposal.slidesBySection[section] ?? 1;
    for (let index = 0; index < count; index += 1) {
      const titleSuffix = count > 1 ? ` ${index + 1}` : "";
      const firstProof = input.extractedInputs.proofPoints[index] ?? input.extractedInputs.proofPoints[0];
      const firstReasonYes = input.extractedInputs.reasonsYes[index] ?? input.extractedInputs.reasonsYes[0];
      slideDeck.push({
        slideIndex,
        section,
        title: `${STORY_SECTION_LABELS[section]}${titleSuffix} — ${sectionSummaries[section].slice(0, 80)}`,
        keyPoints: [
          sectionSummaries[section],
          `Audience lens: ${audienceLabel}`,
          firstReasonYes ? `Why this can land: ${firstReasonYes}` : "Why this can land: make the decision feel safe and useful.",
          firstProof ? `Proof or support: ${firstProof}` : "Proof or support: add evidence that makes the recommendation credible."
        ],
        visual: `Use a simple, executive-friendly visual that reinforces ${STORY_SECTION_LABELS[section].toLowerCase()}.`,
        speakerNotes: `${sectionSummaries[section]} Speak in a ${input.tone ?? "clear, executive, collaborative"} tone and connect the section back to the decision.`
      });
      slideIndex += 1;
    }
  });

  return slideDeck;
}

export async function runCreatorGenerate(input: CreatorGenerateInput) {
  const storyboard = buildStoryboard(input);
  const selfCheck = {
    totalSlidesGenerated: storyboard.length,
    sectionBreakdown: buildSectionBreakdown(storyboard),
    withinTolerance: Math.abs(storyboard.length - input.sectionMapProposal.totalSlides) <= 4,
    notes: [
      "Big Idea is designed as a belief shift rather than a tactic.",
      "Close is expected to include a clear ask and next step.",
      "Storyboard follows the seven-section TPG story flow."
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
