import { execFileSync } from "node:child_process";
import { Buffer as NodeBuffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Artifact } from "../schemas/artifact.js";

const require = createRequire(import.meta.url);
type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfPageData = {
  getTextContent: (options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
};

type PdfParseOptions = {
  pagerender?: (pageData: PdfPageData) => Promise<string>;
  max?: number;
  version?: string;
};

const pdfParse = require("pdf-parse") as (
  buffer: Uint8Array,
  options?: PdfParseOptions
) => Promise<{ text?: string; numpages?: number; numrender?: number }>;

function summarizeImageContent(content?: string): string {
  if (!content) {
    return "";
  }

  return `Visual summary inferred from uploaded image context: ${content.slice(0, 240)}`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r");
}

function extractTaggedText(xml: string, tagPattern: RegExp): string[] {
  const matches = Array.from(xml.matchAll(tagPattern))
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean);
  return matches;
}

function withTempFile<T>(artifact: Artifact, fn: (path: string, tempDirectory: string) => T): T {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);

  try {
    writeFileSync(filePath, Buffer.from(artifact.fileDataBase64 ?? "", "base64"));
    return fn(filePath, tempDirectory);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function withTempBufferFile<T>(artifact: Artifact, buffer: Uint8Array, fn: (path: string, tempDirectory: string) => T): T {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);

  try {
    writeFileSync(filePath, buffer);
    return fn(filePath, tempDirectory);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function getArtifactBuffer(artifact: Artifact): Promise<Uint8Array | undefined> {
  if (artifact.fileDataBase64) {
    return NodeBuffer.from(String(artifact.fileDataBase64), "base64") as unknown as Uint8Array;
  }

  if (!artifact.sourceUrl) {
    return undefined;
  }

  const response = await fetch(artifact.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch artifact source (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function listZipEntries(path: string): string[] {
  const listing = execFileSync("unzip", ["-Z1", path], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readZipEntry(path: string, entry: string): string {
  return execFileSync("unzip", ["-p", path, entry], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
}

function compareSlideEntries(left: string, right: string): number {
  const leftNumber = Number(left.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const rightNumber = Number(right.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return leftNumber - rightNumber;
}

function hasExtension(filename: string | undefined, extension: string): boolean {
  return filename?.toLowerCase().endsWith(extension) ?? false;
}

function normalizeSlideLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePdfPageText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeSlideLine(line))
    .filter(Boolean)
    .join(" | ")
    .trim();
}

async function renderPdfPageText(pageData: PdfPageData, slideNumber: number): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false
  });

  let lastY: number | null = null;
  let text = "";

  for (const item of textContent.items) {
    const value = normalizeSlideLine(item.str ?? "");
    if (!value) {
      continue;
    }

    const y = Array.isArray(item.transform)
      ? Math.round(Number(item.transform[5] ?? 0))
      : null;
    const sameLine = lastY === null || y === null || Math.abs(y - lastY) <= 2;
    text += sameLine
      ? `${text && !/\s$/.test(text) ? " " : ""}${value}`
      : `\n${value}`;

    if (y !== null) {
      lastY = y;
    }
  }

  const normalized = normalizePdfPageText(text);
  return normalized ? `Slide ${slideNumber}: ${normalized}` : `Slide ${slideNumber}: [No extractable text]`;
}

// ── Closing-slide / appendix detection ───────────────────────────────────────

const CLOSING_SLIDE_PATTERNS = [
  /^thank\s*you[.!]?$/i,
  /^thanks[.!]?$/i,
  /^thank\s+you\s+for\s+your/i,
  /^questions?\s*[&+]?\s*answers?$/i,
  /^q\s*[&+\/]\s*a$/i,
  /^any\s+questions/i,
  /^discussion[s]?[.!]?$/i,
  /^contact\s+us$/i,
  /^let'?s\s+connect$/i,
  /^get\s+in\s+touch$/i,
];

const APPENDIX_SECTION_PATTERNS = [
  /appendix/i,
  /backup\s+slides?/i,
  /reference\s+material/i,
  /archive/i,
  /supplemental/i,
  /additional\s+slides?/i,
];

function looksLikeClosingSlide(title: string | null): boolean {
  if (!title) return false;
  return CLOSING_SLIDE_PATTERNS.some((p) => p.test(title.trim()));
}

function looksLikeAppendixSection(sectionName: string): boolean {
  return APPENDIX_SECTION_PATTERNS.some((p) => p.test(sectionName.trim()));
}

// ── PPTX metadata helpers ─────────────────────────────────────────────────────

function extractFirstMatch(xml: string, pattern: RegExp): string | null {
  return pattern.exec(xml)?.[1]?.trim() ?? null;
}

interface PptxSection {
  name: string;
  slideIds: Set<string>;
}

function parsePresentationSections(xml: string): PptxSection[] {
  const lm = xml.match(/<p:sectionLst[^>]*>([\s\S]*?)<\/p:sectionLst>/);
  if (!lm?.[1]) return [];
  const sections: PptxSection[] = [];
  for (const m of (lm[1]).matchAll(/<p:section[^>]+name="([^"]*)"[^>]*>([\s\S]*?)<\/p:section>/g)) {
    const name = decodeXmlEntities(m[1] ?? "");
    const body = m[2] ?? "";
    const slideIds = new Set(
      Array.from(body.matchAll(/<p:sldId[^>]+id="(\d+)"/g)).map((sm) => sm[1] ?? "")
    );
    sections.push({ name, slideIds });
  }
  return sections;
}

function parsePresentationSlideIds(xml: string): string[] {
  const lm = xml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/);
  if (!lm?.[1]) return [];
  return Array.from((lm[1]).matchAll(/<p:sldId[^>]+id="(\d+)"/g)).map((m) => m[1] ?? "");
}

// ── Per-slide parsing ─────────────────────────────────────────────────────────

interface SlideShape {
  role: "title" | "body" | "other";
  paragraphs: Array<{ level: number; text: string }>;
}

function getShapeRole(spXml: string): "title" | "body" | "other" {
  if (!/<p:ph/.test(spXml)) return "other";
  if (/<p:ph[^>]+type="(?:title|ctrTitle)"/.test(spXml)) return "title";
  if (/<p:ph[^>]+type="(?:dt|sldNum|ftr|hdr|pic)"/.test(spXml)) return "other";
  return "body";
}

function extractParagraphsFromShape(spXml: string): Array<{ level: number; text: string }> {
  const txBody = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? "";
  if (!txBody) return [];
  const result: Array<{ level: number; text: string }> = [];
  for (const paraMatch of txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const para = paraMatch[1] ?? "";
    const lvlMatch = para.match(/<a:pPr[^>]+lvl="(\d+)"/);
    const level = lvlMatch ? parseInt(lvlMatch[1] ?? "0") : 0;
    const texts = Array.from(para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((m) => decodeXmlEntities(m[1] ?? "").trim())
      .filter(Boolean);
    const text = texts.join("").trim();
    if (text) result.push({ level, text });
  }
  return result;
}

function parseSlideShapes(slideXml: string): SlideShape[] {
  const shapes: SlideShape[] = [];
  for (const spMatch of slideXml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const spXml = spMatch[1] ?? "";
    const role = getShapeRole(spXml);
    const paragraphs = extractParagraphsFromShape(spXml);
    if (paragraphs.length > 0) shapes.push({ role, paragraphs });
  }
  return shapes;
}

function getSlideTitle(shapes: SlideShape[]): string | null {
  const ts = shapes.find((s) => s.role === "title");
  if (!ts) return null;
  return ts.paragraphs.map((p) => p.text).join(" ").trim() || null;
}

function extractBuildSummary(slideXml: string): string | null {
  if (!/<p:timing>/.test(slideXml)) return null;
  const clickEffects = (slideXml.match(/nodeType="clickEffect"/g) ?? []).length;
  if (clickEffects === 0) return null;
  const hasBulletBuilds = /<p:txEl>/.test(slideXml);
  const type = hasBulletBuilds ? "progressive bullet build" : "shape animations";
  return `${clickEffects} click-reveal${clickEffects !== 1 ? "s" : ""} (${type})`;
}

function extractNotesText(notesXml: string): string | null {
  // Notes slides always have two shapes: sldImg placeholder and body placeholder.
  // We extract all <a:t> content (the sldImg shape has no text so this is safe).
  const texts = Array.from(notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
    .map((m) => decodeXmlEntities(m[1] ?? "").trim())
    .filter(Boolean);
  return texts.join(" ").trim() || null;
}

function parseNotesPath(relsXml: string): string | null {
  // Type URI ends with "/notesSlide"
  const m = relsXml.match(/Type="[^"]*\/notesSlide"[^>]+Target="([^"]+)"/);
  if (!m?.[1]) return null;
  // Target like "../notesSlides/notesSlide1.xml" → "ppt/notesSlides/notesSlide1.xml"
  return m[1].replace(/^\.\.\//, "ppt/");
}

function formatSlideBlock(
  index: number,
  shapes: SlideShape[],
  buildSummary: string | null,
  notes: string | null
): string {
  const lines: string[] = [`=== SLIDE ${index} ===`];

  const titleShape = shapes.find((s) => s.role === "title");
  if (titleShape) {
    const t = titleShape.paragraphs.map((p) => p.text).join(" ").trim();
    if (t) lines.push(`TITLE: "${t}"`);
  }

  const bodyShapes = shapes.filter((s) => s.role === "body");
  if (bodyShapes.length > 0) {
    lines.push("BODY:");
    for (const shape of bodyShapes) {
      for (const para of shape.paragraphs) {
        const pad = "  ".repeat(para.level + 1);
        const prefix = para.level > 0 ? "·" : "•";
        lines.push(`${pad}${prefix} ${para.text}`);
      }
    }
  }

  const otherShapes = shapes.filter((s) => s.role === "other");
  if (otherShapes.length > 0) {
    const otherText = otherShapes
      .flatMap((s) => s.paragraphs.map((p) => p.text))
      .join(" | ")
      .trim();
    if (otherText) lines.push(`OTHER: ${otherText}`);
  }

  if (bodyShapes.length === 0 && otherShapes.every((s) => s.paragraphs.length === 0) && !titleShape) {
    lines.push("[No extractable text]");
  }

  if (buildSummary) lines.push(`BUILDS: ${buildSummary}`);
  if (notes?.trim()) lines.push(`NOTES: ${notes.trim()}`);

  return lines.join("\n");
}

// ── Main rich PPTX extraction ─────────────────────────────────────────────────

function doRichPptxExtraction(filePath: string): string {
  const allEntries = listZipEntries(filePath);
  const entrySet = new Set(allEntries);

  function safeRead(entry: string): string {
    if (!entrySet.has(entry)) return "";
    try { return readZipEntry(filePath, entry); } catch { return ""; }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  const appXml = safeRead("docProps/app.xml");
  const coreXml = safeRead("docProps/core.xml");
  const presentationXml = safeRead("ppt/presentation.xml");

  const totalSlides = parseInt(extractFirstMatch(appXml, /<Slides>(\d+)<\/Slides>/) ?? "0") || 0;
  const hiddenCount = parseInt(extractFirstMatch(appXml, /<HiddenSlides>(\d+)<\/HiddenSlides>/) ?? "0") || 0;
  const notesCount = parseInt(extractFirstMatch(appXml, /<Notes>(\d+)<\/Notes>/) ?? "0") || 0;
  const editingMins = parseInt(extractFirstMatch(appXml, /<TotalTime>(\d+)<\/TotalTime>/) ?? "") || null;
  const presFormat = extractFirstMatch(appXml, /<PresentationFormat>([^<]+)<\/PresentationFormat>/);
  const revisions = parseInt(extractFirstMatch(coreXml, /<cp:revision>(\d+)<\/cp:revision>/) ?? "") || null;
  const author = extractFirstMatch(coreXml, /<dc:creator>([^<]+)<\/dc:creator>/);
  const lastModBy = extractFirstMatch(coreXml, /<cp:lastModifiedBy>([^<]+)<\/cp:lastModifiedBy>/);

  const metaLines: string[] = [];
  {
    const parts: string[] = [];
    if (presFormat) parts.push(`Format: ${presFormat}`);
    const slidesPart = `Slides: ${totalSlides}${hiddenCount > 0 ? ` (${hiddenCount} hidden — excluded)` : ""}`;
    parts.push(slidesPart);
    if (notesCount > 0) parts.push(`Speaker notes on: ${notesCount} of ${totalSlides} slides`);
    if (parts.length > 0) metaLines.push(parts.join(" | "));
  }
  {
    const parts: string[] = [];
    if (author) parts.push(`Author: ${author}`);
    if (lastModBy && lastModBy !== author) parts.push(`Last edited by: ${lastModBy}`);
    if (revisions !== null) parts.push(`Revision: ${revisions}`);
    if (editingMins !== null) parts.push(`Editing time: ~${Math.round(editingMins / 6) / 10}h`);
    if (parts.length > 0) metaLines.push(parts.join(" | "));
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  const sections = parsePresentationSections(presentationXml);
  const appendixSlideIds = new Set<string>();
  for (const section of sections) {
    if (looksLikeAppendixSection(section.name)) {
      for (const id of section.slideIds) appendixSlideIds.add(id);
    }
  }
  const orderedSlideIds = parsePresentationSlideIds(presentationXml);

  // ── Per-slide extraction ──────────────────────────────────────────────────
  const slideEntries = allEntries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort(compareSlideEntries);

  if (!slideEntries.length) return "";

  interface ProcessedSlide {
    index: number;
    isHidden: boolean;
    isAppendix: boolean;
    title: string | null;
    block: string;
  }

  const processed: ProcessedSlide[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i];
    if (!entry) continue;
    const slideIndex = i + 1;

    const slideXml = safeRead(entry);
    if (!slideXml) continue;

    const isHidden = /<p:sld[^>]*\sshow="0"/.test(slideXml);
    const presId = orderedSlideIds[i] ?? null;
    const isAppendix = presId !== null && appendixSlideIds.has(presId);

    const shapes = parseSlideShapes(slideXml);
    const title = getSlideTitle(shapes);
    const buildSummary = extractBuildSummary(slideXml);

    // Speaker notes via relationship file
    let notes: string | null = null;
    const slideNum = entry.match(/slide(\d+)\.xml$/)?.[1];
    if (slideNum) {
      const relsEntry = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relsXml = safeRead(relsEntry);
      if (relsXml) {
        const notesPath = parseNotesPath(relsXml);
        if (notesPath) {
          const notesXml = safeRead(notesPath);
          if (notesXml) notes = extractNotesText(notesXml);
        }
      }
    }

    const block = formatSlideBlock(slideIndex, shapes, buildSummary, notes);
    processed.push({ index: slideIndex, isHidden, isAppendix, title, block });
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  // Find closing slide (first non-hidden, non-appendix slide with a closing title)
  let closingIndex: number | null = null;
  for (const slide of processed) {
    if (!slide.isHidden && !slide.isAppendix && looksLikeClosingSlide(slide.title)) {
      closingIndex = slide.index;
      break;
    }
  }

  const evaluatable = processed.filter((s) => {
    if (s.isHidden) return false;
    if (s.isAppendix) return false;
    // Include the closing slide itself; exclude everything after it
    if (closingIndex !== null && s.index > closingIndex) return false;
    return true;
  });

  const excludedHidden = processed.filter((s) => s.isHidden).length;
  const excludedAppendix = processed.filter((s) => !s.isHidden && s.isAppendix).length;
  const excludedPostClosing =
    closingIndex !== null
      ? processed.filter((s) => !s.isHidden && !s.isAppendix && s.index > closingIndex).length
      : 0;

  // ── Assemble output ───────────────────────────────────────────────────────
  const out: string[] = [];

  if (metaLines.length > 0) {
    out.push("=== PRESENTATION METADATA ===");
    out.push(...metaLines);
    out.push("");
  }

  for (const slide of evaluatable) {
    out.push(slide.block);
    out.push("");
  }

  const exclusions: string[] = [];
  if (excludedHidden > 0) exclusions.push(`${excludedHidden} hidden slide${excludedHidden > 1 ? "s" : ""} not evaluated`);
  if (excludedAppendix > 0) exclusions.push(`${excludedAppendix} appendix/backup slide${excludedAppendix > 1 ? "s" : ""} not evaluated`);
  if (excludedPostClosing > 0) exclusions.push(`${excludedPostClosing} slide${excludedPostClosing > 1 ? "s" : ""} after closing slide not evaluated`);
  if (exclusions.length > 0) {
    out.push("=== EXCLUDED ===");
    out.push(...exclusions);
    out.push("");
  }

  return out.join("\n");
}

// ── PPTX extraction (public-facing, handles both base64 and URL) ──────────────

function extractPptxText(artifact: Artifact): string | undefined {
  if (!artifact.fileDataBase64) {
    return artifact.content ?? artifact.extractedText;
  }
  return withTempFile(artifact, (path) => {
    const result = doRichPptxExtraction(path);
    return result || undefined;
  });
}

async function extractPptxTextFromSource(artifact: Artifact): Promise<string | undefined> {
  const buffer = await getArtifactBuffer(artifact);
  if (!buffer) {
    return artifact.content ?? artifact.extractedText;
  }
  return withTempBufferFile(artifact, buffer, (path) => {
    const result = doRichPptxExtraction(path);
    return result || undefined;
  });
}

// ── PDF closing-slide filter ──────────────────────────────────────────────────

function filterPdfSlides(slides: string[]): { filtered: string[]; excludedCount: number } {
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] ?? "";
    // Get the text content without the "Slide N:" prefix
    const textContent = slide.replace(/^Slide\s+\d+:\s*/i, "").trim();
    // Check the first segment (before any | separator) as the dominant text
    const firstSegment = textContent.split("|")[0]?.trim() ?? "";

    const isClosing = CLOSING_SLIDE_PATTERNS.some((p) => p.test(firstSegment));
    const isAppendix = APPENDIX_SECTION_PATTERNS.some((p) => p.test(firstSegment));

    if (isClosing || isAppendix) {
      // Include the closing slide itself; exclude everything after
      return {
        filtered: slides.slice(0, i + 1),
        excludedCount: slides.length - i - 1
      };
    }
  }
  return { filtered: slides, excludedCount: 0 };
}

// ── PDF extraction ────────────────────────────────────────────────────────────

async function extractPdfText(artifact: Artifact): Promise<string | undefined> {
  const pdfBuffer = await getArtifactBuffer(artifact);
  if (!pdfBuffer) {
    return artifact.content ?? artifact.extractedText;
  }
  let slideNumber = 0;
  const result = await pdfParse(pdfBuffer, {
    pagerender: async (pageData) => {
      slideNumber += 1;
      return renderPdfPageText(pageData, slideNumber);
    }
  });

  const allSlides = (result.text ?? "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const match = block.match(/^Slide\s+(\d+):?\s*([\s\S]*)$/i);
      if (!match) {
        return normalizePdfPageText(block);
      }
      const label = `Slide ${match[1]}`;
      const body = normalizePdfPageText(match[2] ?? "");
      return body ? `${label}: ${body}` : `${label}: [No extractable text]`;
    })
    .filter(Boolean);

  if (!allSlides.length) return undefined;

  const { filtered, excludedCount } = filterPdfSlides(allSlides);

  const parts = [...filtered];
  if (excludedCount > 0) {
    parts.push(`\n[Note: ${excludedCount} slide${excludedCount > 1 ? "s" : ""} after closing/appendix detected and excluded from evaluation]`);
  }

  return parts.join("\n\n") || undefined;
}

// ── DOCX extraction ───────────────────────────────────────────────────────────

function extractDocxText(artifact: Artifact): string | undefined {
  if (!hasExtension(artifact.filename, ".docx")) {
    return artifact.content ?? artifact.extractedText;
  }

  if (!artifact.fileDataBase64) {
    return artifact.content ?? artifact.extractedText;
  }

  return withTempFile(artifact, (path) => {
    const entries = listZipEntries(path).filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry));
    if (!entries.length) {
      return undefined;
    }

    const sections = entries.map((entry) => {
      const xml = readZipEntry(path, entry);
      return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
    }).filter(Boolean);

    return sections.length ? sections.join("\n\n") : undefined;
  });
}

async function extractDocxTextFromSource(artifact: Artifact): Promise<string | undefined> {
  if (!hasExtension(artifact.filename, ".docx")) {
    return artifact.content ?? artifact.extractedText;
  }

  const buffer = await getArtifactBuffer(artifact);
  if (!buffer) {
    return artifact.content ?? artifact.extractedText;
  }

  return withTempBufferFile(artifact, buffer, (path) => {
    const entries = listZipEntries(path).filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry));
    if (!entries.length) {
      return undefined;
    }

    const sections = entries.map((entry) => {
      const xml = readZipEntry(path, entry);
      return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
    }).filter(Boolean);

    return sections.length ? sections.join("\n\n") : undefined;
  });
}

// ── Document text routing ─────────────────────────────────────────────────────

async function extractDocumentText(artifact: Artifact): Promise<string | undefined> {
  if (artifact.extractedText) {
    return artifact.extractedText;
  }

  if (artifact.content) {
    return artifact.content;
  }

  if (artifact.kind === "pptx") {
    if (artifact.fileDataBase64) {
      return extractPptxText(artifact);
    }
    return extractPptxTextFromSource(artifact);
  }

  if (artifact.kind === "doc") {
    if (artifact.fileDataBase64) {
      return extractDocxText(artifact);
    }
    return extractDocxTextFromSource(artifact);
  }

  if (artifact.kind === "pdf") {
    return extractPdfText(artifact);
  }

  return undefined;
}

// ── Image analysis ────────────────────────────────────────────────────────────

async function analyzeImageFromUrl(sourceUrl: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "Image attached — vision analysis unavailable (no API key).";
  }

  try {
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) {
      return `Image attached — could not fetch for analysis (${imageResponse.status}).`;
    }
    const rawBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(rawBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 8192) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
    }
    const base64 = btoa(binary);
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const mediaType = (contentType.split(";")[0] ?? "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";

    const visionResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 }
              },
              {
                type: "text",
                text: "Describe this image concisely for business presentation context. Focus on any key data, messages, charts, strategic content, or planning material visible. Under 200 words."
              }
            ]
          }
        ]
      })
    });

    if (!visionResponse.ok) {
      return "Image attached — vision analysis failed.";
    }

    const json = (await visionResponse.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return json.content.find((b) => b.type === "text")?.text ?? "Image analyzed but no description returned.";
  } catch {
    return "Image attached — vision analysis encountered an error.";
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function processArtifact(artifact: Artifact): Promise<Artifact> {
  if (artifact.kind === "image") {
    const visionSummary =
      artifact.visionSummary ??
      (artifact.sourceUrl
        ? await analyzeImageFromUrl(artifact.sourceUrl)
        : summarizeImageContent(artifact.content));
    return { ...artifact, visionSummary };
  }

  if (artifact.kind === "video") {
    return {
      ...artifact,
      extractedText: artifact.extractedText ?? artifact.content
    };
  }

  return {
    ...artifact,
    extractedText: await extractDocumentText(artifact)
  };
}

export async function processArtifacts(artifacts: Artifact[]): Promise<Artifact[]> {
  return Promise.all(
    artifacts.map(async (artifact) => {
      try {
        return await processArtifact(artifact);
      } catch (error) {
        console.warn("[Deckspert][Artifacts] processing failed", {
          label: artifact.label,
          kind: artifact.kind,
          error: error instanceof Error ? error.message : error
        });
        return artifact;
      }
    })
  );
}

export function flattenArtifactText(artifacts: Artifact[]): string {
  return artifacts
    .map((artifact) => artifact.extractedText ?? artifact.visionSummary ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Returns the full ZIP entry list for a PPTX artifact.
 * Used by the free evaluator to detect embedded video / Excel objects before processing.
 */
export async function listPptxZipEntries(artifact: Artifact): Promise<string[]> {
  if (artifact.kind !== "pptx") return [];

  if (artifact.fileDataBase64) {
    return withTempFile(artifact, (path) => listZipEntries(path));
  }

  if (artifact.sourceUrl) {
    const buffer = await getArtifactBuffer(artifact);
    if (!buffer) return [];
    return withTempBufferFile(artifact, buffer, (path) => listZipEntries(path));
  }

  return [];
}
