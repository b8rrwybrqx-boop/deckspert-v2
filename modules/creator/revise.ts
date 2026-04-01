import { callLLM } from "../../core/llm/client.js";
import {
  creatorReviseResponseSchema,
  type SectionMapProposal,
  type StorySection,
  type StoryboardSlide
} from "../../core/schemas/story.js";
import { STORY_SECTION_LABELS, STORY_SECTION_ORDER } from "../../core/story/structure.js";
import { buildCreatorRevisePrompt } from "./prompts.js";

type CreatorReviseInput = {
  sectionMap: SectionMapProposal;
  storyboard: StoryboardSlide[];
  revisionRequest: {
    revisionText: string;
    target?: {
      scope: "global" | "section" | "slide";
      section?: StorySection;
      slideIndex?: number;
    };
  };
};

type RevisionTarget = CreatorReviseInput["revisionRequest"]["target"];

function applyRevisionToSlide(slide: StoryboardSlide, revisionText: string): StoryboardSlide {
  const lowerRequest = revisionText.toLowerCase();

  if (lowerRequest.includes("tighten")) {
    return {
      ...slide,
      keyPoints: slide.keyPoints.slice(0, 3),
      speakerNotes: `${slide.speakerNotes} Tighten the message and get to the takeaway faster.`
    };
  }

  if (lowerRequest.includes("executive")) {
    return {
      ...slide,
      title: slide.title.replace(/^(.{0,90})$/, "$1"),
      speakerNotes: `${slide.speakerNotes} Use more concise, outcome-led executive language.`
    };
  }

  if (lowerRequest.includes("proof")) {
    return {
      ...slide,
      keyPoints: [...slide.keyPoints, "Add one concrete proof point or placeholder to strengthen credibility."]
    };
  }

  if (lowerRequest.includes("big idea") && slide.section === "bigIdea") {
    return {
      ...slide,
      title: slide.title.includes("Belief Shift") ? slide.title : `${slide.title} (Belief Shift)`,
      keyPoints: slide.keyPoints.map((point, index) =>
        index === 0 ? `${point} Make the belief explicit and decision-oriented.` : point
      )
    };
  }

  return {
    ...slide,
    speakerNotes: `${slide.speakerNotes} Revision applied: ${revisionText}`
  };
}

function reviseStoryboard(
  storyboard: StoryboardSlide[],
  revisionText: string,
  target?: RevisionTarget
): StoryboardSlide[] {
  return storyboard.map((slide) => {
    const matchesScope =
      !target ||
      target.scope === "global" ||
      (target.scope === "section" && target.section === slide.section) ||
      (target.scope === "slide" && target.slideIndex === slide.slideIndex);

    return matchesScope ? applyRevisionToSlide(slide, revisionText) : slide;
  });
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

function targetMatchesSlide(slide: StoryboardSlide, target?: RevisionTarget): boolean {
  return (
    !target ||
    target.scope === "global" ||
    (target.scope === "section" && target.section === slide.section) ||
    (target.scope === "slide" && target.slideIndex === slide.slideIndex)
  );
}

function looksLikeFullStoryboard(original: StoryboardSlide[], revised: StoryboardSlide[]): boolean {
  if (revised.length !== original.length) {
    return false;
  }

  const originalIndexes = original.map((slide) => slide.slideIndex).sort((a, b) => a - b);
  const revisedIndexes = revised.map((slide) => slide.slideIndex).sort((a, b) => a - b);

  return originalIndexes.every((index, idx) => index === revisedIndexes[idx]);
}

function mergeTargetedRevision(
  original: StoryboardSlide[],
  revised: StoryboardSlide[],
  target?: RevisionTarget
): StoryboardSlide[] {
  if (!target || target.scope === "global" || looksLikeFullStoryboard(original, revised)) {
    return revised;
  }

  const originalTargetSlides = original.filter((slide) => targetMatchesSlide(slide, target));
  if (originalTargetSlides.length === 0) {
    return original;
  }

  const replacementByIndex = new Map<number, StoryboardSlide>();
  for (const slide of revised) {
    if (targetMatchesSlide(slide, target)) {
      replacementByIndex.set(slide.slideIndex, slide);
    }
  }

  if (replacementByIndex.size > 0) {
    return original.map((slide) => replacementByIndex.get(slide.slideIndex) ?? slide);
  }

  if (revised.length === originalTargetSlides.length) {
    const orderedTargetSlides = [...originalTargetSlides].sort((a, b) => a.slideIndex - b.slideIndex);
    const orderedRevisedSlides = [...revised].sort((a, b) => a.slideIndex - b.slideIndex);
    const fallbackByIndex = new Map<number, StoryboardSlide>();

    orderedTargetSlides.forEach((targetSlide, index) => {
      const replacement = orderedRevisedSlides[index];
      if (!replacement) {
        return;
      }
      fallbackByIndex.set(targetSlide.slideIndex, {
        ...replacement,
        slideIndex: targetSlide.slideIndex,
        section: targetSlide.section
      });
    });

    return original.map((slide) => fallbackByIndex.get(slide.slideIndex) ?? slide);
  }

  return original;
}

function describeTarget(target?: RevisionTarget): string {
  if (!target || target.scope === "global") {
    return "Global revision across the full storyboard";
  }

  if (target.scope === "section" && target.section) {
    return `Section revision for ${STORY_SECTION_LABELS[target.section]}`;
  }

  if (target.scope === "slide" && target.slideIndex) {
    return `Slide revision for slide ${target.slideIndex}`;
  }

  return "Global revision across the full storyboard";
}

export async function runCreatorRevise(input: CreatorReviseInput) {
  const fallbackStoryboard = reviseStoryboard(
    input.storyboard,
    input.revisionRequest.revisionText,
    input.revisionRequest.target
  );
  const fallbackSelfCheck = {
    totalSlidesGenerated: fallbackStoryboard.length,
    sectionBreakdown: buildSectionBreakdown(fallbackStoryboard),
    withinTolerance: Math.abs(fallbackStoryboard.length - input.sectionMap.totalSlides) <= 4,
    notes: ["Revision preserved the section map and slide count.", "Storyboard remains aligned to the canonical TPG story flow."]
  };
  const prompt = buildCreatorRevisePrompt({
    revisionRequest: input.revisionRequest.revisionText,
    targetDescription: describeTarget(input.revisionRequest.target),
    sectionMapSummary: JSON.stringify(input.sectionMap),
    storyboardSummary: JSON.stringify(input.storyboard)
  });

  try {
    const response = await callLLM(prompt, {
      schema: creatorReviseResponseSchema,
      fallback: () => ({
        creatorVersion: "v2" as const,
        sectionMap: input.sectionMap,
        revisedStoryboard: fallbackStoryboard,
        selfCheck: fallbackSelfCheck,
        changeSummary: [
          `Applied revision request: ${input.revisionRequest.revisionText}`,
          `Target: ${describeTarget(input.revisionRequest.target)}`
        ]
      })
    });

    const mergedStoryboard = mergeTargetedRevision(
      input.storyboard,
      response.revisedStoryboard,
      input.revisionRequest.target
    );

    return creatorReviseResponseSchema.parse({
      ...response,
      revisedStoryboard: mergedStoryboard,
      selfCheck: {
        ...response.selfCheck,
        totalSlidesGenerated: mergedStoryboard.length,
        sectionBreakdown: buildSectionBreakdown(mergedStoryboard),
        withinTolerance: Math.abs(mergedStoryboard.length - input.sectionMap.totalSlides) <= 4,
        notes: [
          ...(response.selfCheck?.notes ?? []),
          "Untouched storyboard sections were preserved during targeted revision."
        ]
      }
    });
  } catch (error) {
    console.warn("[Deckspert][Creator][Revise] Falling back to local revision output", {
      error: error instanceof Error ? error.message : error
    });
    return creatorReviseResponseSchema.parse({
      creatorVersion: "v2",
      sectionMap: input.sectionMap,
      revisedStoryboard: fallbackStoryboard,
      selfCheck: fallbackSelfCheck,
      changeSummary: [
        `Applied revision request: ${input.revisionRequest.revisionText}`,
        `Target: ${describeTarget(input.revisionRequest.target)}`
      ]
    });
  }
}
