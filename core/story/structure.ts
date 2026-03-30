import type { StorySection } from "../schemas/story.js";

export const STORY_SECTION_ORDER: StorySection[] = [
  "title",
  "openingGambit",
  "desiredOutcome",
  "situation",
  "rootCause",
  "bigIdea",
  "howItWorks",
  "wiifm",
  "close",
  "actionsNextSteps"
];

export const STORY_SECTION_LABELS: Record<StorySection, string> = {
  title: "Title",
  openingGambit: "Opening Gambit",
  desiredOutcome: "Desired Outcome",
  situation: "Situation",
  rootCause: "Root Cause",
  bigIdea: "Big Idea",
  howItWorks: "How It Works",
  wiifm: "WIIFM",
  close: "Close",
  actionsNextSteps: "Actions & Next Steps"
};

export function normalizeSectionLabel(section: StorySection): string {
  return STORY_SECTION_LABELS[section];
}
