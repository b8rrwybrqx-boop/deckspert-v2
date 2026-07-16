import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import {
  creatorOutlineResponseSchema,
  type CreatorOutlineResponse,
  type SlideOutlineItem,
  type StorylineSection
} from "../../core/schemas/story.js";
import { VISUAL_DOCTRINE, STYLE_PASS_CHECK, HUMAN_VOICE_PROTOCOL } from "./doctrine.js";

function buildOutlinePrompt(
  storyline: StorylineSection[],
  targetTool: string,
  audienceRole: string | null,
  behavioralStyle: string,
  directive?: string,
  meetingLengthMinutes?: number,
  minutesPerSlide?: number,
  slidesBySection?: Record<string, number>,
  previousOutline?: SlideOutlineItem[]
): string {
  const storylineText = storyline
    .map(
      (s, i) =>
        `Section ${i + 1}: ${s.label}
Takeaway Headline: ${s.takeawayHeadline}
Narrative: ${s.narrative}
Visual / Metaphor: ${s.visualMetaphor}
WIIFM: ${s.wiifm}
Behavioral Note: ${s.behavioralNote}`
    )
    .join("\n\n");

  return `You are Deckspert Creator. Convert this confirmed 7-section storyline into a slide-by-slide presentation outline optimized for ${targetTool}.

AUDIENCE: ${audienceRole ?? "Not specified"}
BEHAVIORAL STYLE: ${behavioralStyle}
TARGET TOOL: ${targetTool}

CONFIRMED STORYLINE:
${storylineText}

${VISUAL_DOCTRINE}

${HUMAN_VOICE_PROTOCOL}

${STYLE_PASS_CHECK}

SLIDE OUTLINE RULES:
${meetingLengthMinutes && minutesPerSlide ? `MEETING CONTEXT: ${meetingLengthMinutes} min meeting at ${minutesPerSlide} min/slide = target of ${Math.round(meetingLengthMinutes / minutesPerSlide)} slides total.` : ""}
${slidesBySection ? `SLIDE ALLOCATION PER SECTION (follow this exactly):
${Object.entries(slidesBySection).map(([k, n]) => `  - ${k}: ${n} slide${n !== 1 ? "s" : ""}`).join("\n")}
ANY section allocated more than 1 slide must be expanded into that many sequential slides, each with a distinct angle, its own headline, bullets, speaker note, and visual. This applies equally to: Summary of the Situation, How This Works, WIIFM, Make the Ask / Close, and any other section. Number them consecutively.` : `Each section starts as 1 slide. ANY of the following sections may expand to 2–3 slides when the content warrants it: Summary of the Situation, How This Works, WIIFM, Make the Ask / Close. Expand these when depth, complexity, or delivery pacing calls for it, do not limit expansion to How This Works only.`}
- headline: the takeaway headline for this slide, must be a complete statement, not a topic label
- bullets: 3–5 slide-ready bullets (short phrases, not full sentences, directly usable in ${targetTool})
- EXCEPTION, Opening Gambit slide: the hook is the slide. Use the storyline's gambit as the headline, keep it under 20 words, and use ZERO or ONE short supporting line as the only bullet. Never expand the gambit into a bullet list; move all context, proof, and transition language into speakerNote. The visual should be sparse and high-contrast, one idea with air around it.
- speakerNote: 2–3 conversational sentences of delivery guidance, tone-aligned to ${behavioralStyle} style
- visualSuggestion: one specific visual recommendation framed for ${targetTool} (e.g. for PowerPoint: "Two-column SmartArt comparing before/after"; for Gamma: "Animated stat callout block")

TOOL-SPECIFIC GUIDANCE for ${targetTool}:
- Bullets should be paste-ready for ${targetTool} without further formatting changes
- Note any ${targetTool}-specific layout or template tips in toolTips

toolTips: 2–3 sentences of formatting conventions or paste tips specific to ${targetTool} that will help the user feed this outline directly into that tool effectively.

${previousOutline?.length ? `PREVIOUSLY APPROVED OUTLINE, the user has already reviewed and approved the slides below. PRESERVE these slides verbatim (headline, bullets, speakerNote, visualSuggestion) wherever the underlying storyline section is unchanged. Only re-author slides whose underlying section content has substantively changed in the storyline above, or whose section is named in the regeneration directive (if any). When in doubt, keep the prior slide. Renumber consecutively after any insertions/removals.

${previousOutline.map((s) => `Slide ${s.slideNumber} [${s.sectionKey}/${s.sectionLabel}]
  Headline: ${s.headline}
  Bullets: ${s.bullets.map((b) => `\n    - ${b}`).join("")}
  Speaker note: ${s.speakerNote}
  Visual: ${s.visualSuggestion}`).join("\n\n")}` : ""}

${directive ? `REGENERATION DIRECTIVE, apply this specific guidance to this version. Treat it as the highest-priority instruction:\n"${directive}"\nChange only what the directive asks for. Keep all other slides consistent with the original storyline unless the change logically requires adjustment.` : ""}

Return ONLY this JSON, no markdown, no code fences:
{
  "creatorVersion": "v2",
  "targetTool": "${targetTool}",
  "outline": [
    {
      "slideNumber": 1,
      "sectionKey": "openingGambit",
      "sectionLabel": "Opening Gambit",
      "headline": "...",
      "bullets": ["...", "...", "..."],
      "speakerNote": "...",
      "visualSuggestion": "..."
    }
  ],
  "toolTips": "..."
}

Generate all slides in order. Ensure slideNumber starts at 1 and increments by 1 for each slide.`;
}

function fallbackOutline(
  storyline: StorylineSection[],
  targetTool: string
): CreatorOutlineResponse {
  return {
    creatorVersion: "v2",
    targetTool,
    outline: storyline.map((s, i) => ({
      slideNumber: i + 1,
      sectionKey: s.key,
      sectionLabel: s.label,
      headline: s.takeawayHeadline,
      bullets: [
        "[Bullet 1, pending generation]",
        "[Bullet 2, pending generation]",
        "[Bullet 3, pending generation]"
      ],
      speakerNote: "[Speaker note, pending generation]",
      visualSuggestion: s.visualMetaphor
    })),
    toolTips: `Paste this outline directly into ${targetTool} to get started. Each slide corresponds to one section of the TPG story framework.`
  };
}

export async function runCreatorOutline(
  storyline: StorylineSection[],
  targetTool: string,
  audienceRole: string | null,
  behavioralStyle: string,
  directive?: string,
  meetingLengthMinutes?: number,
  minutesPerSlide?: number,
  slidesBySection?: Record<string, number>,
  previousOutline?: SlideOutlineItem[]
): Promise<CreatorOutlineResponse> {
  const prompt = buildOutlinePrompt(storyline, targetTool, audienceRole, behavioralStyle, directive, meetingLengthMinutes, minutesPerSlide, slidesBySection, previousOutline);

  return callAnthropicLLM(prompt, {
    schema: creatorOutlineResponseSchema,
    system: "You are Deckspert Creator, a TPG persuasive storytelling specialist. Return only valid JSON, no markdown, no code fences.",
    maxTokens: 8192,
    fallback: () => fallbackOutline(storyline, targetTool)
  });
}
