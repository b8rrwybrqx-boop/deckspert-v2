import { z } from "zod";

// Input contract for the starter-deck renderer.
//
// This is deliberately NOT the Creator's storyboardSlideSchema. The Creator
// describes a story; a deck also needs to know how each beat should be drawn.
// `toStarterDeck` in ../deck/fromStoryboard.ts maps one to the other, so the
// renderer never has to guess a layout at draw time.
//
// Five layouts, and adding a sixth should require an argument. Every extra
// layout is another way for a generated deck to look wrong, and the point of
// this output is to be reliable rather than impressive.

export const starterSlideLayoutSchema = z.enum([
  "title",     // opening slide, navy
  "section",   // divider (Introduction / Explanation / Conclusion / Appendix)
  "statement", // one idea, large: Opening Gambit, Root Cause, Big Idea, Close
  "points",    // headline plus proof: Situation, Now What, Recommendation, Actions
  "metric"     // WIIFM: the number is the slide
]);

export const starterSlideSchema = z.object({
  slideIndex: z.number().int().positive(),
  /** Printed as the slide eyebrow, so it carries the worksheet's own wording. */
  section: z.string(),
  layout: starterSlideLayoutSchema,
  title: z.string(),
  keyPoints: z.array(z.string()).default([]),
  speakerNotes: z.string().default("")
});

export const starterDeckSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z.array(starterSlideSchema).min(1)
});

export type StarterSlideLayout = z.infer<typeof starterSlideLayoutSchema>;
export type StarterSlide = z.infer<typeof starterSlideSchema>;
export type StarterDeck = z.infer<typeof starterDeckSchema>;

/** Reported to the caller so the UI can warn before anyone presents the deck. */
export type StarterDeckWarning = { slideIndex: number; field: string; message: string };

// ── Draft: what a model may produce ──────────────────────────────────────────
//
// The model decides CONTENT and how many slides each worksheet box earns. It
// does not decide layout: `toStarterDeck` maps section to layout and the
// renderer draws. Keeping that split is what stops a bad generation from
// producing a structurally broken deck rather than merely a weak one, and it is
// why `layout` is absent here on purpose.

export const starterDeckDraftSlideSchema = z.object({
  slideIndex: z.number().int().positive(),
  /** A section key from the program's worksheet, or "title" / "appendix". */
  section: z.string(),
  title: z.string(),
  // Optional rather than defaulted: a Zod default makes the inferred input and
  // output types diverge, and the LLM helper is generic over the input side.
  keyPoints: z.array(z.string()).optional(),
  /** Chart or image suggestion. Never drawn; carried into the speaker notes. */
  visual: z.string().optional(),
  speakerNotes: z.string().optional()
});

export const starterDeckDraftSchema = z.object({
  deckVersion: z.literal("starter-deck-v1"),
  title: z.string(),
  subtitle: z.string().optional(),
  /**
   * Bounded so a runaway generation cannot produce a 200-slide deck. The upper
   * bound is deliberately close to the 10 to 14 slides the method teaches: a
   * starter deck that needs more than this is not a starter deck.
   */
  slides: z.array(starterDeckDraftSlideSchema).min(3).max(20)
});

export type StarterDeckDraft = z.infer<typeof starterDeckDraftSchema>;
