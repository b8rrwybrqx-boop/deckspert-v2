import PptxGenJS from "pptxgenjs";
import {
  starterDeckSchema,
  type StarterDeck,
  type StarterSlide,
  type StarterDeckWarning
} from "../schemas/starterDeck.js";

// Deterministic storyboard -> PPTX renderer.
//
// There is no model call in this file, and there must never be one. Everything
// that can fail the way generation fails (truncation, unparseable output,
// timeouts, retries) happens upstream in the evaluator or the Creator, against
// a Zod schema. By the time a deck reaches here the content is already valid,
// so rendering is a pure function of it: same input, same bytes, every time.
// That is the whole reliability argument for this output, and it only holds
// while this stays deterministic.

const NAVY = "04164C";
const BLUE = "2E75B6";
const GOLD = "BF8F00";
const INK = "1A1A1A";
const MUTE = "5A6474";
const RULE = "D8DDE5";

/** Never embed a font. Arial is present on every machine that opens this. */
const FONT = "Arial";

const PAGE_W = 13.333;
const PAGE_H = 7.5;
const MARGIN = 0.62;

/**
 * Character budgets, enforced before anything is drawn.
 *
 * Generated decks fail most often by spilling text out of its box, and
 * PowerPoint's own autofit behaves differently across versions and platforms,
 * so it cannot be the only defence. Truncating to a budget and telling the
 * caller what was cut is worse-looking but predictable, which is the trade this
 * output exists to make. The limits also happen to push the same direction as
 * the rubric: a bullet that cannot fit here was too long to say out loud.
 */
const BUDGET = { title: 110, statement: 150, bullet: 130, support: 180, metric: 12 };

const MAX_POINTS = 5;

type Ctx = { warnings: StarterDeckWarning[] };

function budget(text: string, max: number, slideIndex: number, field: string, ctx: Ctx): string {
  const value = (text ?? "").trim();
  if (value.length <= max) return value;
  ctx.warnings.push({
    slideIndex,
    field,
    message: `Trimmed from ${value.length} to ${max} characters. Shorten it before you present.`
  });
  return value.slice(0, max - 1).replace(/[\s,;:.\-]+$/, "") + "…";
}

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function addFooter(slide: Slide, index: number): void {
  slide.addShape("line", {
    x: MARGIN, y: PAGE_H - 0.62, w: PAGE_W - MARGIN * 2, h: 0,
    line: { color: RULE, width: 0.75 }
  });
  slide.addText("TPG Persuasive Storytelling", {
    x: MARGIN, y: PAGE_H - 0.55, w: 4, h: 0.3, fontSize: 9, color: MUTE, fontFace: FONT
  });
  slide.addText(String(index), {
    x: PAGE_W - MARGIN - 1, y: PAGE_H - 0.55, w: 1, h: 0.3,
    fontSize: 9, color: MUTE, fontFace: FONT, align: "right"
  });
}

/** The worksheet box this slide came from, so the deck stays legible as a storyboard. */
function addEyebrow(slide: Slide, label: string): void {
  if (!label.trim()) return;
  slide.addText(label.toUpperCase(), {
    x: MARGIN, y: 0.5, w: PAGE_W - MARGIN * 2, h: 0.3,
    fontSize: 11, bold: true, color: BLUE, charSpacing: 1.5, fontFace: FONT
  });
}

function bulletBlock(points: string[], slideIndex: number, ctx: Ctx) {
  return points.map((point) => ({
    text: budget(point, BUDGET.bullet, slideIndex, "keyPoint", ctx),
    options: { bullet: { code: "2022" }, breakLine: true }
  }));
}

function capPoints(slide: StarterSlide, ctx: Ctx): string[] {
  const points = slide.keyPoints ?? [];
  if (points.length > MAX_POINTS) {
    ctx.warnings.push({
      slideIndex: slide.slideIndex,
      field: "keyPoints",
      message: `${points.length} points supplied; only the first ${MAX_POINTS} were drawn. Split the slide or cut.`
    });
  }
  return points.slice(0, MAX_POINTS);
}

const LAYOUTS: Record<string, (slide: Slide, data: StarterSlide, ctx: Ctx) => void> = {
  title(slide, data, ctx) {
    slide.background = { color: NAVY };
    slide.addText(budget(data.title, BUDGET.title, data.slideIndex, "title", ctx), {
      x: MARGIN, y: 2.5, w: PAGE_W - MARGIN * 2, h: 1.4,
      fontSize: 44, bold: true, color: "FFFFFF", fontFace: FONT, valign: "bottom"
    });
    slide.addShape("line", { x: MARGIN, y: 4.05, w: 2.2, h: 0, line: { color: GOLD, width: 2.5 } });
    const sub = data.keyPoints?.[0];
    if (sub) {
      slide.addText(sub, {
        x: MARGIN, y: 4.25, w: PAGE_W - MARGIN * 2, h: 0.5,
        fontSize: 16, color: "C8D2E4", fontFace: FONT
      });
    }
  },

  section(slide, data, ctx) {
    slide.background = { color: "F4F6F9" };
    slide.addText(budget(data.title, BUDGET.title, data.slideIndex, "title", ctx), {
      x: MARGIN, y: 3.0, w: PAGE_W - MARGIN * 2, h: 0.9,
      fontSize: 32, bold: true, color: NAVY, fontFace: FONT
    });
    const sub = data.keyPoints?.[0];
    if (sub) {
      slide.addText(sub, {
        x: MARGIN, y: 3.95, w: PAGE_W - MARGIN * 2, h: 0.5, fontSize: 15, color: MUTE, fontFace: FONT
      });
    }
    addFooter(slide, data.slideIndex);
  },

  statement(slide, data, ctx) {
    addEyebrow(slide, data.section);
    slide.addText(budget(data.title, BUDGET.statement, data.slideIndex, "title", ctx), {
      x: MARGIN, y: 1.45, w: PAGE_W - MARGIN * 2, h: 2.0,
      fontSize: 32, bold: true, color: NAVY, fontFace: FONT, valign: "top", fit: "shrink"
    });
    slide.addShape("line", { x: MARGIN, y: 3.62, w: 2.2, h: 0, line: { color: GOLD, width: 2.5 } });
    (data.keyPoints ?? []).slice(0, 3).forEach((point, i) => {
      slide.addText(budget(point, BUDGET.support, data.slideIndex, "keyPoint", ctx), {
        x: MARGIN, y: 3.95 + i * 0.75, w: PAGE_W - MARGIN * 2, h: 0.7,
        fontSize: 17, color: INK, fontFace: FONT, valign: "top", fit: "shrink"
      });
    });
    addFooter(slide, data.slideIndex);
  },

  points(slide, data, ctx) {
    addEyebrow(slide, data.section);
    slide.addText(budget(data.title, BUDGET.title, data.slideIndex, "title", ctx), {
      x: MARGIN, y: 1.0, w: PAGE_W - MARGIN * 2, h: 1.15,
      fontSize: 26, bold: true, color: NAVY, fontFace: FONT, valign: "top", fit: "shrink"
    });
    slide.addShape("line", { x: MARGIN, y: 2.25, w: PAGE_W - MARGIN * 2, h: 0, line: { color: RULE, width: 1 } });
    slide.addText(bulletBlock(capPoints(data, ctx), data.slideIndex, ctx), {
      x: MARGIN + 0.1, y: 2.55, w: PAGE_W - MARGIN * 2 - 0.2, h: 3.7,
      fontSize: 17, color: INK, fontFace: FONT, lineSpacingMultiple: 1.35, valign: "top", fit: "shrink"
    });
    addFooter(slide, data.slideIndex);
  },

  metric(slide, data, ctx) {
    addEyebrow(slide, data.section);
    slide.addText(budget(data.title, BUDGET.metric, data.slideIndex, "title", ctx), {
      x: MARGIN, y: 1.5, w: 5.0, h: 1.7,
      fontSize: 80, bold: true, color: NAVY, fontFace: FONT, valign: "middle"
    });
    const caption = data.keyPoints?.[0];
    if (caption) {
      slide.addText(caption, {
        x: MARGIN, y: 3.2, w: 5.0, h: 0.5, fontSize: 18, bold: true, color: GOLD, fontFace: FONT
      });
    }
    const rest = (data.keyPoints ?? []).slice(1, 1 + MAX_POINTS);
    slide.addText(bulletBlock(rest, data.slideIndex, ctx), {
      x: 6.4, y: 1.7, w: PAGE_W - 6.4 - MARGIN, h: 3.9,
      fontSize: 17, color: INK, fontFace: FONT, lineSpacingMultiple: 1.35, valign: "top", fit: "shrink"
    });
    addFooter(slide, data.slideIndex);
  }
};

export type RenderedStarterDeck = {
  bytes: NodeBufferLike;
  slideCount: number;
  warnings: StarterDeckWarning[];
};

export async function renderStarterDeck(input: unknown): Promise<RenderedStarterDeck> {
  const deck: StarterDeck = starterDeckSchema.parse(input);
  const ctx: Ctx = { warnings: [] };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "TPG16x9", width: PAGE_W, height: PAGE_H });
  pptx.layout = "TPG16x9";

  // Overrides PptxGenJS's own defaults on purpose. core/artifacts/extract.ts
  // matches /pptxgenjs/i against Company, dc:creator and dc:title to spot
  // machine-generated decks, and flags any match "image-carried" so the
  // evaluator renders its slides through CloudConvert instead of reading the
  // text. Left at the library defaults, a deck Deckspert produced would trip
  // that check on re-upload and get a slower, weaker evaluation than a deck
  // someone built by hand. Do not remove.
  pptx.author = "Deckspert";
  pptx.company = "The Partnering Group";
  pptx.title = deck.title;
  pptx.subject = "Deckspert storyboard export";

  for (const data of deck.slides) {
    const draw = LAYOUTS[data.layout] ?? LAYOUTS.points;
    const slide = pptx.addSlide();
    draw(slide, data, ctx);
    if (data.speakerNotes.trim()) slide.addNotes(data.speakerNotes.trim());
  }

  const bytes = (await pptx.write({ outputType: "nodebuffer" })) as NodeBufferLike;
  return { bytes, slideCount: deck.slides.length, warnings: ctx.warnings };
}
