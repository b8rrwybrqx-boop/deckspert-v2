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
    "Opening Gambit must be a hook, not an agenda or context slide. Prefer bold statements, sharp contrasts, revealing questions, short quotes, or concrete proof/data points when the source supports them. If the source lacks 2-5 concrete facts or tensions needed for a strong hook, say so explicitly in gaps rather than bluffing.",
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
    "Every slide title must be a takeaway headline, not a topic label, agenda label, section name, or coaching instruction.",
    "Write speaker notes first in your reasoning, then extract the sharpest single takeaway from the notes and use that as the title.",
    "Title should orient the audience with WHAT we are proposing and WHY it matters now. Include WHO only when it sharpens orientation rather than bloating the title.",
    "Use TPG section-level page discipline by default: Opening Gambit 1 slide, Desired Outcome 1, Situation 1-2, Root Cause 1, Big Idea 1, How It Works 2-4, WIIFM 1, Close 1, Actions & Next Steps 1.",
    "Only How It Works should naturally expand. Situation may occasionally justify a second slide. Root Cause, Big Idea, and WIIFM should stay on one slide unless the source materially justifies expansion.",
    "Opening Gambit must be a true hook: one idea only, minimal text, answers why now, and should prefer a provocative statement, tension, startling fact, question, metaphor, quote, or direct data point over safe business-summary language.",
    "The final line or implication of the Opening Gambit must set up the Desired Outcome. The core tension introduced in the gambit should be answered by the ask.",
    "Do not write Opening Gambit like presentation coaching. Avoid phrases such as 'the audience should', 'frame the story', 'this should feel', or 'the current choice is still being framed'. Write the slide as the actual presentation writer.",
    "If the source does not support a compelling Opening Gambit, say so directly in the slide content and ask for 2-5 facts needed to sharpen it.",
    "Desired Outcome must be one concise sentence with a decision verb, object of approval/alignment/understanding, and business purpose. Strong pattern: 'Approve [action] so we can [business result].' Reject vague wording like review, discuss, or explore.",
    "Big Idea must be one standalone declarative belief sentence only. It is not a list, tactic, recommendation, capability description, or belief-plus-plan hybrid.",
    "Prevent solution-description language in Big Idea unless it clearly functions as a belief. If it sounds like 'use X solution to do Y,' rewrite it as what the audience must believe.",
    "Big Idea should usually work as a pattern like 'To achieve X, we must Y.'",
    "Do not let Big Idea dominate the deck title or repeat across multiple slides unless the source explicitly centers the deck on that belief shift.",
    "How It Works must hold 2-4 strategic pillars or operating logic only. Do not include WIIFM benefits, close language, or detailed workplan bullets.",
    "WIIFM must translate value to the audience in business and personal terms. Identify the primary audience first, rank benefits by likely decision relevance, and limit to the top 3 benefits unless the section map explicitly requires more.",
    "WIIFM benefits must be phrased as outcomes for the audience, not attributes of the solution.",
    "Close must restate the recommendation, the stakes, and the implied ask. It should feel like the final persuasive moment, not a recap label.",
    "Close is the final persuasive slide before execution. Actions & Next Steps that follow may not introduce new persuasion claims; they should only convert agreement into execution.",
    "Actions & Next Steps should hold the specific asks, owners, timing, and accountability moves. Every next-step bullet must include an owner role, timing or milestone, and success measure/checkpoint.",
    "Situation and Root Cause must stay logically distinct even if adjacent: Situation = current state, pressure, or trend; Root Cause = why the issue exists. Root Cause cannot be just another market fact.",
    "Use section-specific language: Situation/Root Cause = diagnosis; Big Idea = belief; How It Works = mechanism; WIIFM = audience outcomes; Close = alignment/decision; Actions = owner/timing/accountability.",
    "Avoid repeating the same nouns or phrases across Big Idea, How It Works, WIIFM, Close, and Actions. Repetition should reinforce the story, not blur the sections.",
    "Before finalizing, internally validate all nine story elements, Big Idea as belief, WIIFM as audience benefit, Close as ask/value/why now, Actions with owner/timing/accountability, and no major section overlap. Repair weak sections before returning JSON.",
    "Do not let coaching language leak into slide copy. Avoid final slide headlines or bullets that start with phrases like 'the audience should', 'this should feel', 'frame the story', 'show how', or 'ground it in'.",
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
    "For Opening Gambit revisions, prefer bolder hooks, sharper contrasts, and source-grounded quotes or data points instead of generic urgency language.",
    "Preserve TPG section discipline: Root Cause, Big Idea, and WIIFM should remain one slide by default, and only How It Works should naturally expand across multiple slides.",
    "Keep Opening Gambit hook-like, Desired Outcome concise and decision-oriented, Big Idea as one belief sentence, How It Works as 2-4 strategic pillars, WIIFM as top audience outcomes, Close as ask/value/why now, and Actions & Next Steps actionable.",
    "Do not blur Big Idea, How It Works, and WIIFM: Big Idea = belief, How It Works = mechanism, WIIFM = audience value.",
    "Every Actions & Next Steps bullet should include owner role, timing or milestone, and checkpoint/accountability.",
    `Revision target: ${input.targetDescription}`,
    `Revision request: ${input.revisionRequest}`,
    `Section map:\n${input.sectionMapSummary}`,
    input.storyboardSummary
  ].join("\n\n");
}
