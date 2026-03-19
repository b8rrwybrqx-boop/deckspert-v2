import type { ExtractedInputs, SectionMapProposal, StorySection } from "../schemas/story.js";
import { STORY_SECTION_ORDER } from "./structure.js";

const baseWeights: Record<StorySection, number> = {
  openingGambit: 1,
  desiredOutcome: 1,
  situation: 2,
  rootCause: 1,
  bigIdea: 2,
  howItWorks: 2,
  close: 1
};

const complexityMultiplier = {
  low: 0,
  medium: 1,
  high: 2
} as const;

export function buildSectionMap(inputs: ExtractedInputs): SectionMapProposal {
  const estimatedSlides = Math.max(
    5,
    Math.round(inputs.meetingLengthMinutes / Math.max(inputs.minutesPerSlide, 1))
  );
  const weights = { ...baseWeights };
  weights.situation += complexityMultiplier[inputs.storyComplexity];
  weights.howItWorks += complexityMultiplier[inputs.storyComplexity];
  weights.bigIdea += inputs.proofPoints.length > 3 ? 1 : 0;

  const weightSum = Object.values(weights).reduce((sum, value) => sum + value, 0);
  let remaining = estimatedSlides;
  const slidesBySection = {} as Record<StorySection, number>;

  STORY_SECTION_ORDER.forEach((section, index) => {
    if (index === STORY_SECTION_ORDER.length - 1) {
      slidesBySection[section] = Math.max(1, remaining);
      return;
    }

    const raw = Math.max(1, Math.round((estimatedSlides * weights[section]) / weightSum));
    const allocated = Math.min(raw, remaining - (STORY_SECTION_ORDER.length - index - 1));
    slidesBySection[section] = allocated;
    remaining -= allocated;
  });

  return {
    meetingLengthMinutes: inputs.meetingLengthMinutes,
    minutesPerSlide: inputs.minutesPerSlide,
    targetSlides: estimatedSlides,
    totalSlides: estimatedSlides,
    slidesBySection,
    rationale:
      "Slide counts are balanced across the seven-section story, with extra weight on Situation, Big Idea, and How It Works when complexity is higher."
  };
}
