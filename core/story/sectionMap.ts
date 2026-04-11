import type { ExtractedInputs, SectionMapProposal, StorySection } from "../schemas/story.js";
import { STORY_SECTION_ORDER } from "./structure.js";

const sectionMinimums: Record<StorySection, number> = {
  title: 1,
  openingGambit: 1,
  desiredOutcome: 1,
  situation: 1,
  rootCause: 1,
  bigIdea: 1,
  howItWorks: 2,
  wiifm: 1,
  close: 1,
  actionsNextSteps: 1
};

const sectionMaximums: Record<StorySection, number> = {
  title: 1,
  openingGambit: 1,
  desiredOutcome: 1,
  situation: 2,
  rootCause: 1,
  bigIdea: 1,
  howItWorks: 4,
  wiifm: 1,
  close: 1,
  actionsNextSteps: 1
};

const extraSlidePriority: StorySection[] = ["howItWorks", "situation"];

function estimateTargetSlides(inputs: ExtractedInputs) {
  const pacingTarget = Math.round(inputs.meetingLengthMinutes / Math.max(inputs.minutesPerSlide, 1));
  const discussionTarget = Math.round(inputs.meetingLengthMinutes / 3);
  const baselineTarget = Math.max(pacingTarget, discussionTarget, 10);

  if (inputs.storyComplexity === "low") {
    return Math.max(10, Math.min(11, baselineTarget));
  }
  if (inputs.storyComplexity === "high") {
    return Math.max(11, Math.min(13, baselineTarget + 1));
  }

  return Math.max(10, Math.min(12, baselineTarget));
}

export function buildSectionMap(inputs: ExtractedInputs): SectionMapProposal {
  const estimatedSlides = estimateTargetSlides(inputs);
  const slidesBySection = { ...sectionMinimums };
  const minimumSlides = Object.values(sectionMinimums).reduce((sum, value) => sum + value, 0);
  let remaining = Math.max(0, Math.min(estimatedSlides, Object.values(sectionMaximums).reduce((sum, value) => sum + value, 0)) - minimumSlides);

  while (remaining > 0) {
    let allocatedThisRound = false;

    for (const section of extraSlidePriority) {
      const cap = sectionMaximums[section];
      const shouldSkipRootCause =
        section === "rootCause" && inputs.storyComplexity !== "high" && inputs.reasonsNo.length < 3 && inputs.constraints.length < 3;
      const shouldSkipSituation =
        section === "situation" && inputs.storyComplexity === "low" && inputs.proofPoints.length < 3;
      const shouldSkipWiifm = section === "wiifm" && inputs.reasonsYes.length < 3;

      if (shouldSkipRootCause || shouldSkipSituation || shouldSkipWiifm) {
        continue;
      }

      if (slidesBySection[section] < cap) {
        slidesBySection[section] += 1;
        remaining -= 1;
        allocatedThisRound = true;
        if (remaining === 0) {
          break;
        }
      }
    }

    if (!allocatedThisRound) {
      break;
    }
  }

  const totalSlides = STORY_SECTION_ORDER.reduce((sum, section) => sum + slidesBySection[section], 0);

  return {
    meetingLengthMinutes: inputs.meetingLengthMinutes,
    minutesPerSlide: inputs.minutesPerSlide,
    targetSlides: estimatedSlides,
    totalSlides,
    slidesBySection,
    rationale:
      "Section counts follow the TPG story-shape default: WIIFM, Root Cause, and Big Idea stay on one slide by default, How It Works is the only section that naturally expands, and extra pages are used first for solution pillars and then situation/context when complexity clearly justifies them."
  };
}
