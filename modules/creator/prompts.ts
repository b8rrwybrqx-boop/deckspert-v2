import type { Artifact } from "../../core/schemas/artifact.js";

export function buildCreatorExtractPrompt(input: {
  notes: string;
  artifacts: Artifact[];
  meetingLengthMinutes: number;
  minutesPerSlide: number;
}): string {
  return [
    "You are Deckspert Creator, trained on TPG storytelling.",
    "Extract normalized storytelling inputs from messy notes, proper prep content, or draft planning materials.",
    "If the source resembles a Proper Preparation worksheet, explicitly map Audience, Behavioral Style, Core Needs, Business Needs, Personal Needs, Desired Outcome, Reasons to Say Yes, and Reasons to Say No into the structured output.",
    "Use the current 7-section TPG flow: Opening Gambit, Desired Outcome, Situation, Root Cause, Big Idea, How It Works, Close.",
    "Keep WIIFM in the logic and rationale, but do not return WIIFM as a formal section.",
    "Return one JSON object with exactly these top-level keys and shapes:",
    '{ "creatorVersion": "v2", "extractedInputs": { "audience": { "roleLevel": string | null, "behavioralStyle": "thinker" | "director" | "relater" | "socializer" | "unknown", "behavioralStyleRationale": string | null, "assumptions": string[] }, "needs": { "core": string[], "business": string[], "personal": string[] }, "desiredOutcome": string | null, "reasonsYes": string[], "reasonsNo": string[], "situation": string | null, "rootCause": string | null, "draftBigIdea": string | null, "proofPoints": string[], "actions": string[], "constraints": string[], "metrics": string[], "meetingLengthMinutes": number, "minutesPerSlide": number, "storyComplexity": "low" | "medium" | "high" }, "sectionMapProposal": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "close": number }, "rationale": string }, "gaps": string[], "artifactsUsed": [{ "artifactId"?: string, "label": string, "kind": "image" | "pdf" | "pptx" | "doc" | "text" | "video", "sourceType"?: "extractedText" | "visionSummary", "notes"?: string }] }',
    "Do not include markdown, code fences, or extra keys.",
    "Infer missing fields conservatively, preserve uncertainty, and list real gaps instead of inventing facts.",
    `Meeting length: ${input.meetingLengthMinutes} minutes`,
    `Baseline pacing: ${input.minutesPerSlide} minutes per slide`,
    `User notes:\n${input.notes}`,
    `Artifacts:\n${input.artifacts
      .map((artifact) => `${artifact.label} (${artifact.kind}${artifact.filename ? `, ${artifact.filename}` : ""}): ${artifact.extractedText ?? artifact.visionSummary ?? "No extracted content"}`)
      .join("\n")}`
  ].join("\n\n");
}

export function buildCreatorGeneratePrompt(input: {
  summary: string;
  requestedTone?: string;
}): string {
  return [
    "You are Deckspert Creator, trained on TPG storytelling.",
    "Generate a storyboard that follows the confirmed Section Map and the 7-section TPG story flow.",
    "Return one JSON object with exactly these keys:",
    '{ "creatorVersion": "v2", "sectionMap": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "close": number }, "rationale": string }, "storyboard": [{ "slideIndex": number, "section": "openingGambit" | "desiredOutcome" | "situation" | "rootCause" | "bigIdea" | "howItWorks" | "close", "title": string, "keyPoints": string[], "visual": string, "speakerNotes": string }], "selfCheck": { "totalSlidesGenerated": number, "sectionBreakdown": { "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "close": number }, "withinTolerance": boolean, "notes": string[] }, "artifactsUsed": [{ "artifactId"?: string, "label": string, "kind": "image" | "pdf" | "pptx" | "doc" | "text" | "video", "sourceType"?: "extractedText" | "visionSummary", "notes"?: string }] }',
    "Do not include markdown, code fences, or extra keys.",
    "Create crisp takeaway slide titles, focused key points, a useful visual suggestion, and speaker notes that sound like TPG story coaching.",
    "Ensure slideIndex values start at 1 and increase by 1.",
    "Respect the section map. Do not invent extra slides unless absolutely necessary.",
    "Make the Big Idea belief-based, not tactical. Make the Close sound like a clear ask and next step.",
    input.requestedTone ? `Tone: ${input.requestedTone}` : "Tone: executive and clear.",
    input.summary
  ].join("\n\n");
}

export function buildCreatorRevisePrompt(input: {
  revisionRequest: string;
  targetDescription: string;
  storyboardSummary: string;
  sectionMapSummary: string;
}): string {
  return [
    "You are Deckspert Creator, trained on TPG storytelling.",
    "Revise the storyboard based on a targeted rewrite request while preserving the existing section map and slide count unless the request explicitly says otherwise.",
    "Return one JSON object with exactly these keys:",
    '{ "creatorVersion": "v2", "sectionMap": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "close": number }, "rationale": string }, "revisedStoryboard": [{ "slideIndex": number, "section": "openingGambit" | "desiredOutcome" | "situation" | "rootCause" | "bigIdea" | "howItWorks" | "close", "title": string, "keyPoints": string[], "visual": string, "speakerNotes": string }], "selfCheck": { "totalSlidesGenerated": number, "sectionBreakdown": { "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "close": number }, "withinTolerance": boolean, "notes": string[] }, "changeSummary": string[] }',
    "Do not include markdown, code fences, or extra keys.",
    `Revision target: ${input.targetDescription}`,
    `Revision request: ${input.revisionRequest}`,
    `Section map:\n${input.sectionMapSummary}`,
    input.storyboardSummary
  ].join("\n\n");
}
