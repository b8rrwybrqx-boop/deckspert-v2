import type { StarterDeck, StarterSlide, StarterSlideLayout } from "../schemas/starterDeck.js";

// Maps a storyboard onto the starter-deck layouts.
//
// The Creator's storyboard is already slide-level rather than box-level: its
// sectionMap decides how many slides each worksheet box earns, so this does not
// need to expand anything. Its only real job is choosing a layout per section
// and keeping the Creator's visual suggestion alive as an instruction to the
// person who builds the real deck.

type StoryboardInput = {
  slideIndex: number;
  section: string;
  title: string;
  keyPoints?: string[];
  /** Two juxtaposed elements, such as Situation against Root Cause. */
  panels?: { heading: string; keyPoints: string[] }[];
  /** The Creator's chart/visual suggestion. Never drawn; passed to the builder. */
  visual?: string;
  speakerNotes?: string;
};

/**
 * Section key -> layout. Keys are lowercased and stripped of separators before
 * lookup, so "actionsNextSteps", "actions_next_steps" and "Actions & Next
 * Steps" all land in the same place and a profile can use the worksheet's own
 * wording without this table having to know about it.
 */
const SECTION_LAYOUTS: Record<string, StarterSlideLayout> = {
  title: "title",
  appendix: "section",
  divider: "section",
  openinggambit: "statement",
  desiredoutcome: "statement",
  situation: "points",
  situationrootcause: "points",
  rootcause: "statement",
  rootcausewhy: "statement",
  bigidea: "statement",
  howitworks: "points",
  nowwhatyoudid: "points",
  wiifm: "metric",
  recommendation: "points",
  executivetakeaway: "points",
  close: "statement",
  summarizegaincommitment: "statement",
  actionsnextsteps: "points"
};

function normalize(section: string): string {
  return section.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * WIIFM only earns the big-number layout when it actually leads with a number.
 * The rubric wants a hard financial figure there, but a storyboard that has not
 * got one yet should still render: it falls back to bullets rather than blowing
 * up a sentence to 80pt.
 */
function isShortMetric(title: string): boolean {
  const t = title.trim();
  return t.length <= 12 && /\d/.test(t);
}

function chooseLayout(entry: StoryboardInput): StarterSlideLayout {
  const { section, title } = entry;
  if (entry.panels?.length === 2) return "split";
  const layout = SECTION_LAYOUTS[normalize(section)] ?? "points";
  if (layout === "metric" && !isShortMetric(title)) return "points";
  return layout;
}

/**
 * The deck is low fidelity on purpose, so it never draws the chart the Creator
 * imagined. Carrying the suggestion into the notes means the instruction
 * survives to whoever builds the real slide instead of being silently dropped.
 */
function notesWithVisual(notes: string | undefined, visual: string | undefined): string {
  const base = (notes ?? "").trim();
  const hint = (visual ?? "").trim();
  if (!hint) return base;
  return base ? `${base}\n\nVISUAL TO BUILD: ${hint}` : `VISUAL TO BUILD: ${hint}`;
}

/**
 * Prettifies a bare section key as a last resort.
 *
 * Section keys are camelCase, and printing one raw put "SITUATIONROOTCAUSE"
 * across the top of a generated slide. The profile's own label is always
 * preferred; this only covers a key the profile does not define, such as
 * "appendix".
 */
function fallbackLabel(section: string): string {
  const spaced = section
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A split slide carries its content in panels and leaves keyPoints empty. When
 * the model supplies panels but not exactly two, the slide falls back to
 * bullets, so fold the panels into them rather than drawing an empty slide.
 */
function withStrayPanels(entry: StoryboardInput): string[] {
  const points = entry.keyPoints ?? [];
  if (!entry.panels?.length || points.length) return points;
  return entry.panels.flatMap((panel) => panel.keyPoints.map((point) => `${panel.heading}: ${point}`));
}

export function toStarterDeck(
  storyboard: StoryboardInput[],
  meta: {
    title: string;
    subtitle?: string;
    /** Section key to worksheet label, so slides carry the program's wording. */
    sectionLabels?: Record<string, string>;
  }
): StarterDeck {
  const slides: StarterSlide[] = storyboard.map((entry, i) => {
    const layout = chooseLayout(entry);
    return {
      slideIndex: entry.slideIndex ?? i + 1,
      section: meta.sectionLabels?.[entry.section] ?? fallbackLabel(entry.section),
      layout,
      title: entry.title,
      keyPoints: layout === "split" ? [] : withStrayPanels(entry),
      ...(layout === "split" ? { panels: entry.panels } : {}),
      speakerNotes: notesWithVisual(entry.speakerNotes, entry.visual)
    };
  });

  const hasTitleSlide = slides.some((s) => s.layout === "title");
  if (!hasTitleSlide) {
    slides.unshift({
      slideIndex: 0,
      section: "title",
      layout: "title",
      title: meta.title,
      keyPoints: meta.subtitle ? [meta.subtitle] : [],
      speakerNotes: "Title slide. Do not narrate it. Go straight to the hook."
    });
  }

  // Renumber after any insertion so the page numbers drawn on the slides match
  // their real position rather than whatever the storyboard happened to carry.
  slides.forEach((slide, i) => {
    slide.slideIndex = i + 1;
  });

  return { title: meta.title, subtitle: meta.subtitle, slides };
}
