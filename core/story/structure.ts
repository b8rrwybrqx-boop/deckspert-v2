import type { StorySection } from "../schemas/story.js";

export const STORY_SECTION_ORDER: StorySection[] = [
  "openingGambit",
  "desiredOutcome",
  "situation",
  "rootCause",
  "bigIdea",
  "howItWorks",
  "close"
];

export const STORY_SECTION_LABELS: Record<StorySection, string> = {
  openingGambit: "Opening Gambit",
  desiredOutcome: "Desired Outcome",
  situation: "Situation",
  rootCause: "Root Cause",
  bigIdea: "Big Idea",
  howItWorks: "How It Works",
  close: "Close"
};

export function normalizeSectionLabel(section: StorySection): string {
  return STORY_SECTION_LABELS[section];
}
