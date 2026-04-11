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
    "Use the canonical TPG story flow: Title, Opening Gambit, Desired Outcome, Situation, Root Cause, Big Idea, How It Works, WIIFM, Close, Actions & Next Steps.",
    "Infer a Creator mode based on the source materials: generateFromPrep, improveExistingDeck, or improveDeckWithPrep.",
    "Opening Gambit must be a hook, not an agenda or context slide. If the source lacks 2-5 concrete facts or tensions needed for a strong hook, say so explicitly in gaps rather than bluffing.",
    "Desired Outcome must be the yes or decision the audience should make, not a meeting topic.",
    "Big Idea must be a belief shift, not a tactic or action list.",
    "WIIFM should translate value in audience terms, not internal team terms.",
    "Default section-map discipline should stay tight: Root Cause = 1 slide, Big Idea = 1 slide, WIIFM = 1 slide unless the source clearly justifies more space.",
    "Return one JSON object with exactly these top-level keys and shapes:",
    '{ "creatorVersion": "v2", "extractedInputs": { "audience": { "roleLevel": string | null, "behavioralStyle": "thinker" | "director" | "relater" | "socializer" | "unknown", "behavioralStyleRationale": string | null, "assumptions": string[] }, "needs": { "core": string[], "business": string[], "personal": string[] }, "desiredOutcome": string | null, "reasonsYes": string[], "reasonsNo": string[], "situation": string | null, "rootCause": string | null, "draftBigIdea": string | null, "draftOpeningGambit": string | null, "wiifm": string | null, "proofPoints": string[], "actions": string[], "constraints": string[], "metrics": string[], "meetingLengthMinutes": number, "minutesPerSlide": number, "storyComplexity": "low" | "medium" | "high", "creatorMode": "generateFromPrep" | "improveExistingDeck" | "improveDeckWithPrep" }, "sectionMapProposal": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "title": number, "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "wiifm": number, "close": number, "actionsNextSteps": number }, "rationale": string }, "gaps": string[], "artifactsUsed": [{ "artifactId"?: string, "label": string, "kind": "image" | "pdf" | "pptx" | "doc" | "text" | "video", "sourceType"?: "extractedText" | "visionSummary", "notes"?: string }] }',
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
    "Generate a storyboard that follows the confirmed Section Map and the canonical TPG story flow.",
    "Return one JSON object with exactly these keys:",
    '{ "creatorVersion": "v2", "sectionMap": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "title": number, "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "wiifm": number, "close": number, "actionsNextSteps": number }, "rationale": string }, "storyboard": [{ "slideIndex": number, "section": "title" | "openingGambit" | "desiredOutcome" | "situation" | "rootCause" | "bigIdea" | "howItWorks" | "wiifm" | "close" | "actionsNextSteps", "title": string, "keyPoints": string[], "visual": string, "speakerNotes": string }], "selfCheck": { "totalSlidesGenerated": number, "sectionBreakdown": { "title": number, "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "wiifm": number, "close": number, "actionsNextSteps": number }, "withinTolerance": boolean, "notes": string[] }, "artifactsUsed": [{ "artifactId"?: string, "label": string, "kind": "image" | "pdf" | "pptx" | "doc" | "text" | "video", "sourceType"?: "extractedText" | "visionSummary", "notes"?: string }] }',
    "Do not include markdown, code fences, or extra keys.",
    "Create crisp takeaway slide titles, focused key points, a useful visual suggestion, and speaker notes that sound like TPG story coaching.",
    "Ensure slideIndex values start at 1 and increase by 1.",
    "Respect the section map. Do not invent extra slides unless absolutely necessary.",
    "Every slide title must be a takeaway headline, not a topic label, agenda label, or section name.",
    "Write speaker notes first in your reasoning, then extract the sharpest single takeaway from the notes and use that as the title.",
    "Use TPG section-level page discipline by default: Opening Gambit 1 slide, Desired Outcome 1, Situation 1-2, Root Cause 1, Big Idea 1, How It Works 2-4, WIIFM 1, Close 1, Actions & Next Steps 1.",
    "Only How It Works should naturally expand. Situation may occasionally justify a second slide. Root Cause, Big Idea, and WIIFM should stay on one slide unless the source materially justifies expansion.",
    "Opening Gambit must be a true hook: one idea only, minimal text, answers why now, and may use a provocative statement, tension, startling fact, question, metaphor, or quote.",
    "If the source does not support a compelling Opening Gambit, say so directly in the slide content and ask for 2-5 facts needed to sharpen it.",
    "Desired Outcome must clearly state what the audience should approve, align to, endorse, or say yes to. Reject vague wording like review, discuss, or explore.",
    "Big Idea must be belief-based, not tactical, and should usually work as a pattern like 'To achieve X, we must Y.'",
    "Do not let Big Idea dominate the deck title or repeat across multiple slides unless the source explicitly centers the deck on that belief shift.",
    "How It Works must hold the 2-4 strategic pillars or operating logic, not detailed workplan bullets.",
    "WIIFM must translate value to the audience in business and personal terms.",
    "Actions & Next Steps should hold the specific asks, owners, timing, and accountability moves.",
    "Follow slide-discipline defaults: one main idea per slide, around 100 words worth of content, normal-slide hard cap around 200 words, and much tighter Opening Gambit / Desired Outcome / Big Idea / Close slides.",
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
    '{ "creatorVersion": "v2", "sectionMap": { "meetingLengthMinutes": number | null, "minutesPerSlide": number | null, "targetSlides": number | null, "totalSlides": number, "slidesBySection": { "title": number, "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "wiifm": number, "close": number, "actionsNextSteps": number }, "rationale": string }, "revisedStoryboard": [{ "slideIndex": number, "section": "title" | "openingGambit" | "desiredOutcome" | "situation" | "rootCause" | "bigIdea" | "howItWorks" | "wiifm" | "close" | "actionsNextSteps", "title": string, "keyPoints": string[], "visual": string, "speakerNotes": string }], "selfCheck": { "totalSlidesGenerated": number, "sectionBreakdown": { "title": number, "openingGambit": number, "desiredOutcome": number, "situation": number, "rootCause": number, "bigIdea": number, "howItWorks": number, "wiifm": number, "close": number, "actionsNextSteps": number }, "withinTolerance": boolean, "notes": string[] }, "changeSummary": string[] }',
    "Do not include markdown, code fences, or extra keys.",
    "Maintain takeaway headlines and rewrite weak topic labels into statements that say what the slide means.",
    "Preserve TPG section discipline: Root Cause, Big Idea, and WIIFM should remain one slide by default, and only How It Works should naturally expand across multiple slides.",
    "Keep Opening Gambit hook-like, Big Idea belief-based, How It Works strategic, WIIFM audience-specific, and Actions & Next Steps actionable.",
    `Revision target: ${input.targetDescription}`,
    `Revision request: ${input.revisionRequest}`,
    `Section map:\n${input.sectionMapSummary}`,
    input.storyboardSummary
  ].join("\n\n");
}
