import { z } from "zod";
import { processArtifacts } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callAnthropicLLM, callAnthropicLLMWithContent } from "../../core/llm/anthropic.js";
import { buildUserContent } from "../evaluator/platformEvaluator.js";
import { toStarterDeck } from "../../core/deck/fromStoryboard.js";
import { renderStarterDeck } from "../../core/deck/starterDeck.js";
import { starterDeckDraftSchema, type StarterDeckDraft } from "../../core/schemas/starterDeck.js";
import { TPG_DEFAULT, type ProgramProfile } from "../../core/programs/index.js";
import type { StarterDeckWarning } from "../../core/schemas/starterDeck.js";

// Turns a written storyboard into a low-fidelity starter deck.
//
// Two stages, and the split is the point:
//
//   1. A model reads the worksheet and decides CONTENT: which box becomes how
//      many slides, what each slide says, what to put in the notes. This stage
//      can fail the way generation always fails, so it is schema-validated and
//      retried by core/llm/anthropic.ts.
//   2. Deterministic code maps sections to layouts and draws the file. No model
//      call, no branching on model confidence.
//
// So a weak generation yields a weak deck, never a broken one.

const DEFAULT_MODEL = "claude-sonnet-4-6";

const starterDeckRequestSchema = z.object({
  notes: z.string().optional(),
  artifacts: z.array(z.unknown()).optional(),
  title: z.string().optional()
});

const NO_EM_DASH =
  "Do not use em-dashes (the long dash) anywhere in your output. Use commas, colons, periods, or parentheses instead.";

function buildInstructions(
  title: string | null,
  pastedText: string,
  hasFiles: boolean,
  profile: ProgramProfile
): string {
  const sectionList = profile.storyboard.sections
    .map((section) => `- "${section.key}" (${section.label})`)
    .join("\n");

  const content = hasFiles
    ? `The storyboard is attached below.${pastedText ? `\n\nAdditional notes:\n${pastedText.slice(0, 8000)}` : ""}`
    : `STORYBOARD CONTENT:\n${pastedText.slice(0, 30000)}`;

  return `You are building a STARTER DECK from an attendee's completed storyboard, during a live executive presentation training session.

This deck is scaffolding, not a finished presentation. The attendee will rebuild it properly. Your job is to get their own words onto correctly structured slides so they start from a story rather than a blank page. Do not invent content: if a box is thin, produce a thin slide. Never fabricate a number, a name, or a result that is not in their material.

${NO_EM_DASH}

SECTIONS available, from this program's planning worksheet:
${sectionList}
- "title" for the opening slide
- "appendix" for a divider and anything cut from the main story

SLIDE RULES:
- Aim for 10 to 14 slides total. A tight executive presentation is not longer than that.
- One slide per worksheet box is the default. Split a box into two only when it genuinely carries two beats, for example a Situation with a distinct root cause.
- Slide titles are FULL SENTENCES that state the point, not topic labels. "Complexity is a tax on growth" is a title. "Background" is not.
- Keep titles under 100 characters and each key point under 120. Anything longer will be trimmed when the file is built.
- At most 5 key points per slide. Fewer is better.
- For a WIIFM slide leading with a financial figure, put ONLY the figure in "title" (for example "$200K") and put its caption first in keyPoints (for example "in annual savings"). That renders as a large number. If there is no figure, write a normal sentence title instead.
- Write speakerNotes for every slide: what the presenter should actually do or say, in the voice of a coach. Where their material is weak against the method, say so in the notes.
- Use "visual" for a chart or image suggestion. It is never drawn; it is carried into the notes as an instruction for whoever builds the real slide.

TASK: Return a single JSON object. No markdown, no code fences:
{
  "deckVersion": "starter-deck-v1",
  "title": ${title ? `"${title.replace(/"/g, "'")}"` : "<a short deck title drawn from their material>"},
  "subtitle": <optional one line, for example the meeting and date>,
  "slides": [
    { "slideIndex": <1-based>, "section": <one of the section keys above>, "title": <full-sentence point>, "keyPoints": [<0-5 short lines>], "visual": <optional suggestion>, "speakerNotes": <coaching for this slide> }
  ]
}

${content}`;
}

export type StarterDeckResult = {
  filename: string;
  /** The .pptx itself. The caller decides how to hand it to the browser. */
  bytes: NodeBufferLike;
  slideCount: number;
  warnings: StarterDeckWarning[];
  deckTitle: string;
};

function deckTitleFallback(title: string | null): string {
  return title || "Starter Deck";
}

/** Safe across Windows, macOS and Content-Disposition. */
function toFilename(title: string): string {
  const base = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);
  if (!base) return "Starter-Deck.pptx";
  // An untitled run already gets the title "Starter Deck", and appending the
  // suffix to that produced "Starter-Deck-Starter-Deck.pptx".
  if (/starter-?deck$/i.test(base)) return `${base}.pptx`;
  return `${base}-Starter-Deck.pptx`;
}

export async function runStarterDeck(
  input: unknown,
  profile: ProgramProfile = TPG_DEFAULT
): Promise<StarterDeckResult> {
  const payload = starterDeckRequestSchema.parse(input);
  const title = payload.title?.trim() || null;
  const pastedText = (payload.notes ?? "").trim();

  const processed = await processArtifacts(createArtifacts(payload.artifacts ?? []));
  const hasFiles = processed.length > 0;

  if (!pastedText && !hasFiles) {
    throw new Error("Paste your storyboard (or upload it) to build a starter deck.");
  }

  const model = process.env.SESSION_DECK_MODEL ?? process.env.SESSION_EVALUATOR_MODEL ?? DEFAULT_MODEL;
  const system = `You build starter decks from storyboards. ${NO_EM_DASH} Return only valid JSON, no markdown, no code fences.`;
  const instructions = buildInstructions(title, pastedText, hasFiles, profile);

  // core/llm/anthropic.ts only reaches this when ANTHROPIC_API_KEY is absent;
  // a real generation failure throws and surfaces as an error banner. So the
  // fallback has to be unmistakably not their work: an attendee must never
  // carry a plausible-looking deck into a room believing it came from their
  // storyboard.
  const fallback = (): StarterDeckDraft => ({
    deckVersion: "starter-deck-v1",
    title: deckTitleFallback(title),
    slides: [
      { slideIndex: 1, section: "title", title: deckTitleFallback(title), keyPoints: ["Starter deck could not be generated"], speakerNotes: "" },
      { slideIndex: 2, section: "appendix", title: "Deck generation is unavailable", keyPoints: ["The story engine is not configured on this environment.", "Your storyboard was not read, and nothing on these slides comes from it.", "Tell your facilitator, then try again."], speakerNotes: "Configuration problem, not a problem with your storyboard." },
      { slideIndex: 3, section: "appendix", title: "Nothing here reflects your work", keyPoints: ["Do not present this deck."], speakerNotes: "" }
    ]
  });

  let draft: StarterDeckDraft;
  if (hasFiles) {
    const artifactBlocks = await buildUserContent(processed, "");
    draft = await callAnthropicLLMWithContent(
      [{ type: "text", text: instructions }, ...artifactBlocks],
      { schema: starterDeckDraftSchema, model, system, maxTokens: 8192, fallback }
    );
  } else {
    draft = await callAnthropicLLM(instructions, {
      schema: starterDeckDraftSchema,
      model,
      system,
      maxTokens: 8192,
      fallback
    });
  }

  const deckTitle = title || draft.title;
  // The slide eyebrow should say what the worksheet says, not the internal key.
  const sectionLabels = Object.fromEntries(profile.storyboard.sections.map((section) => [section.key, section.label]));
  const deck = toStarterDeck(draft.slides, { title: deckTitle, subtitle: draft.subtitle, sectionLabels });
  const rendered = await renderStarterDeck(deck);

  return {
    filename: toFilename(deckTitle),
    bytes: rendered.bytes,
    slideCount: rendered.slideCount,
    warnings: rendered.warnings,
    deckTitle
  };
}
